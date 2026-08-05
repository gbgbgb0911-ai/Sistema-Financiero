import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, CardRow } from "@/types/database";

type Client = SupabaseClient<Database>;

export async function findCards(
  client: Client,
  userId: string,
  includeArchived = false,
): Promise<CardRow[]> {
  let query = client.from("cards").select("*").eq("user_id", userId);
  if (!includeArchived) query = query.is("archived_at", null);

  const { data, error } = await query
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as CardRow[];
}

export async function findCardById(
  client: Client,
  userId: string,
  id: string,
): Promise<CardRow | null> {
  const { data, error } = await client
    .from("cards")
    .select("*")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return (data as CardRow) ?? null;
}

/** Busca por los 4 últimos dígitos. Es lo que devuelve el parser de correos. */
export async function findCardByLast4(
  client: Client,
  userId: string,
  last4: string,
): Promise<CardRow | null> {
  const { data, error } = await client
    .from("cards")
    .select("*")
    .eq("user_id", userId)
    .eq("last4", last4)
    .is("archived_at", null)
    .maybeSingle();

  if (error) throw error;
  return (data as CardRow) ?? null;
}

export async function insertCard(
  client: Client,
  values: Database["public"]["Tables"]["cards"]["Insert"],
): Promise<CardRow> {
  const { data, error } = await client.from("cards").insert(values).select("*").single();
  if (error) throw error;
  return data as CardRow;
}

export async function updateCard(
  client: Client,
  userId: string,
  id: string,
  values: Database["public"]["Tables"]["cards"]["Update"],
): Promise<CardRow> {
  const { data, error } = await client
    .from("cards")
    .update(values)
    .eq("user_id", userId)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data as CardRow;
}

export async function clearDefaultFlag(client: Client, userId: string): Promise<void> {
  const { error } = await client
    .from("cards")
    .update({ is_default: false })
    .eq("user_id", userId)
    .eq("is_default", true);
  if (error) throw error;
}

/** Consumos de una tarjeta dentro de un rango. Base del saldo del ciclo. */
export async function sumCardSpending(
  client: Client,
  userId: string,
  cardId: string,
  from: string,
  to: string,
): Promise<number> {
  const { data, error } = await client
    .from("expenses")
    .select("amount")
    .eq("user_id", userId)
    .eq("card_id", cardId)
    .eq("status", "confirmed")
    .gte("occurred_at", from)
    .lte("occurred_at", to);

  if (error) throw error;
  const rows = (data ?? []) as Array<{ amount: number }>;
  return Math.round(rows.reduce((sum, r) => sum + Number(r.amount), 0) * 100) / 100;
}
