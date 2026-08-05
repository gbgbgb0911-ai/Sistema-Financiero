import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  PaymentRow,
  PaymentOccurrenceRow,
  OccurrenceStatus,
} from "@/types/database";

type Client = SupabaseClient<Database>;

export interface PaymentWithRelations extends PaymentRow {
  category: { id: string; name: string; icon: string; color: string } | null;
  card: { id: string; name: string; last4: string | null } | null;
}

export interface OccurrenceWithPayment extends PaymentOccurrenceRow {
  payment: {
    id: string;
    name: string;
    frequency: string;
    reminder_days: number[];
    auto_create_expense: boolean;
    category_id: string | null;
    card_id: string | null;
  } | null;
}

const PAYMENT_SELECT = `
  *,
  category:categories!payments_category_id_fkey (id, name, icon, color),
  card:cards!payments_card_id_fkey (id, name, last4)
`;

const OCCURRENCE_SELECT = `
  *,
  payment:payments!payment_occurrences_payment_id_fkey (
    id, name, frequency, reminder_days, auto_create_expense, category_id, card_id
  )
`;

export async function findPayments(
  client: Client,
  userId: string,
  options: { includeInactive?: boolean } = {},
): Promise<PaymentWithRelations[]> {
  let query = client.from("payments").select(PAYMENT_SELECT).eq("user_id", userId);
  if (!options.includeInactive) query = query.eq("is_active", true);

  const { data, error } = await query.order("anchor_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as PaymentWithRelations[];
}

export async function findPaymentById(
  client: Client,
  userId: string,
  id: string,
): Promise<PaymentWithRelations | null> {
  const { data, error } = await client
    .from("payments")
    .select(PAYMENT_SELECT)
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return (data as unknown as PaymentWithRelations) ?? null;
}

export async function insertPayment(
  client: Client,
  values: Database["public"]["Tables"]["payments"]["Insert"],
): Promise<PaymentRow> {
  const { data, error } = await client.from("payments").insert(values).select("*").single();
  if (error) throw error;
  return data as PaymentRow;
}

export async function updatePayment(
  client: Client,
  userId: string,
  id: string,
  values: Database["public"]["Tables"]["payments"]["Update"],
): Promise<PaymentRow> {
  const { data, error } = await client
    .from("payments")
    .update(values)
    .eq("user_id", userId)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data as PaymentRow;
}

/**
 * Materializa las ocurrencias del pago hasta un horizonte.
 * La función SQL es idempotente (UNIQUE payment_id + due_date), así que
 * llamarla de más no duplica vencimientos.
 */
export async function materializeOccurrences(
  client: Client,
  paymentId: string,
  horizon?: string,
): Promise<number> {
  const { data, error } = await client.rpc("materialize_payment_occurrences", {
    p_payment_id: paymentId,
    ...(horizon ? { p_horizon: horizon } : {}),
  });
  if (error) throw error;
  return (data as number) ?? 0;
}

export async function findUpcomingOccurrences(
  client: Client,
  userId: string,
  options: { from?: string; to?: string; limit?: number; statuses?: OccurrenceStatus[] } = {},
): Promise<OccurrenceWithPayment[]> {
  let query = client
    .from("payment_occurrences")
    .select(OCCURRENCE_SELECT)
    .eq("user_id", userId)
    .in("status", options.statuses ?? ["pending", "overdue"]);

  if (options.from) query = query.gte("due_date", options.from);
  if (options.to) query = query.lte("due_date", options.to);

  const { data, error } = await query
    .order("due_date", { ascending: true })
    .limit(options.limit ?? 50);

  if (error) throw error;
  return (data ?? []) as unknown as OccurrenceWithPayment[];
}

export async function findOccurrenceById(
  client: Client,
  userId: string,
  id: string,
): Promise<OccurrenceWithPayment | null> {
  const { data, error } = await client
    .from("payment_occurrences")
    .select(OCCURRENCE_SELECT)
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return (data as unknown as OccurrenceWithPayment) ?? null;
}

export async function findOccurrencesByPayment(
  client: Client,
  userId: string,
  paymentId: string,
  limit = 24,
): Promise<PaymentOccurrenceRow[]> {
  const { data, error } = await client
    .from("payment_occurrences")
    .select("*")
    .eq("user_id", userId)
    .eq("payment_id", paymentId)
    .order("due_date", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as PaymentOccurrenceRow[];
}

export async function updateOccurrence(
  client: Client,
  userId: string,
  id: string,
  values: Database["public"]["Tables"]["payment_occurrences"]["Update"],
): Promise<PaymentOccurrenceRow> {
  const { data, error } = await client
    .from("payment_occurrences")
    .update(values)
    .eq("user_id", userId)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data as PaymentOccurrenceRow;
}

/**
 * Ocurrencia pendiente más próxima cuyo nombre de pago coincida.
 * Es lo que permite responder "marcar Netflix como pagado" desde WhatsApp.
 */
export async function findOccurrenceByPaymentName(
  client: Client,
  userId: string,
  nameQuery: string,
): Promise<OccurrenceWithPayment | null> {
  const { data: payments, error: paymentError } = await client
    .from("payments")
    .select("id, name")
    .eq("user_id", userId)
    .ilike("name", `%${nameQuery}%`)
    .limit(1);

  if (paymentError) throw paymentError;
  const payment = payments?.[0];
  if (!payment) return null;

  const { data, error } = await client
    .from("payment_occurrences")
    .select(OCCURRENCE_SELECT)
    .eq("user_id", userId)
    .eq("payment_id", payment.id)
    .in("status", ["pending", "overdue"])
    .order("due_date", { ascending: true })
    .limit(1);

  if (error) throw error;
  return (data?.[0] as unknown as OccurrenceWithPayment) ?? null;
}

export async function sumPendingOccurrences(
  client: Client,
  userId: string,
  from: string,
  to: string,
): Promise<{ total: number; count: number }> {
  const { data, error } = await client
    .from("payment_occurrences")
    .select("amount")
    .eq("user_id", userId)
    .in("status", ["pending", "overdue"])
    .gte("due_date", from)
    .lte("due_date", to);

  if (error) throw error;
  const rows = (data ?? []) as Array<{ amount: number }>;
  return {
    total: Math.round(rows.reduce((sum, r) => sum + Number(r.amount), 0) * 100) / 100,
    count: rows.length,
  };
}
