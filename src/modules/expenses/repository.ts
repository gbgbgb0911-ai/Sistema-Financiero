import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ExpenseRow } from "@/types/database";
import type { ExpenseFilters } from "./schema";

/**
 * Acceso a datos de gastos.
 *
 * Es la única capa que habla con Supabase para este dominio. Si un componente
 * importa `supabase` directamente, es un error de revisión.
 */

type Client = SupabaseClient<Database>;

/** Gasto con sus relaciones resueltas, tal como lo consume la interfaz. */
export interface ExpenseWithRelations extends ExpenseRow {
  category: { id: string; name: string; icon: string; color: string } | null;
  merchant: { id: string; name: string; logo_url: string | null } | null;
  card: { id: string; name: string; last4: string | null; color: string } | null;
}

const SELECT_WITH_RELATIONS = `
  *,
  category:categories!expenses_category_id_fkey (id, name, icon, color),
  merchant:merchants!expenses_merchant_id_fkey (id, name, logo_url),
  card:cards!expenses_card_id_fkey (id, name, last4, color)
`;

export async function findExpenses(
  client: Client,
  userId: string,
  filters: ExpenseFilters,
): Promise<{ items: ExpenseWithRelations[]; nextCursor: string | null }> {
  let query = client
    .from("expenses")
    .select(SELECT_WITH_RELATIONS)
    .eq("user_id", userId);

  // Por defecto se ocultan los anulados: siguen existiendo para auditoría,
  // pero no deben ensuciar el historial ni los totales.
  query = filters.statuses?.length
    ? query.in("status", filters.statuses)
    : query.neq("status", "voided");

  if (filters.from) query = query.gte("occurred_at", filters.from);
  if (filters.to) query = query.lt("occurred_at", filters.to);
  if (filters.categoryIds?.length) query = query.in("category_id", filters.categoryIds);
  if (filters.cardIds?.length) query = query.in("card_id", filters.cardIds);
  if (filters.merchantIds?.length) query = query.in("merchant_id", filters.merchantIds);
  if (filters.minAmount !== undefined) query = query.gte("amount", filters.minAmount);
  if (filters.maxAmount !== undefined) query = query.lte("amount", filters.maxAmount);
  if (filters.sources?.length) query = query.in("source", filters.sources);

  // Búsqueda de texto sobre la columna tsvector generada (índice GIN),
  // no un LIKE '%...%' que no escala.
  if (filters.search) {
    const terms = filters.search
      .trim()
      .split(/\s+/)
      .map((term) => term.replace(/[^\p{L}\p{N}]/gu, ""))
      .filter(Boolean)
      .join(" & ");
    if (terms) query = query.textSearch("search_tsv", terms, { config: "spanish" });
  }

  const sortColumn = filters.sortBy === "amount" ? "amount" : "occurred_at";
  const ascending = filters.sortDir === "asc";

  if (filters.cursor) {
    query = ascending
      ? query.gt(sortColumn, filters.cursor)
      : query.lt(sortColumn, filters.cursor);
  }

  // Se pide un elemento de más para saber si hay página siguiente sin un COUNT.
  const { data, error } = await query
    .order(sortColumn, { ascending })
    .order("id", { ascending })
    .limit(filters.limit + 1);

  if (error) throw error;

  const rows = (data ?? []) as unknown as ExpenseWithRelations[];
  const hasMore = rows.length > filters.limit;
  const items = hasMore ? rows.slice(0, filters.limit) : rows;
  const last = items[items.length - 1];

  return {
    items,
    nextCursor: hasMore && last
      ? String(sortColumn === "amount" ? last.amount : last.occurred_at)
      : null,
  };
}

export async function findExpenseById(
  client: Client,
  userId: string,
  id: string,
): Promise<ExpenseWithRelations | null> {
  const { data, error } = await client
    .from("expenses")
    .select(SELECT_WITH_RELATIONS)
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return (data as unknown as ExpenseWithRelations) ?? null;
}

export async function insertExpense(
  client: Client,
  values: Database["public"]["Tables"]["expenses"]["Insert"],
): Promise<ExpenseRow> {
  const { data, error } = await client.from("expenses").insert(values).select("*").single();
  if (error) throw error;
  return data as ExpenseRow;
}

export async function updateExpense(
  client: Client,
  userId: string,
  id: string,
  values: Database["public"]["Tables"]["expenses"]["Update"],
): Promise<ExpenseRow> {
  const { data, error } = await client
    .from("expenses")
    .update(values)
    .eq("user_id", userId)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data as ExpenseRow;
}

/** Anula en lugar de borrar: un gasto anulado sigue siendo información contable. */
export async function voidExpense(client: Client, userId: string, id: string): Promise<void> {
  const { error } = await client
    .from("expenses")
    .update({ status: "voided" })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw error;
}

/**
 * Busca un posible duplicado: mismo importe, mismo comercio normalizado y
 * misma tarjeta dentro de una ventana temporal.
 *
 * Cubre el caso real de los correos bancarios, que envían una notificación de
 * pre-autorización y otra de consumo por la misma compra.
 */
export async function findPotentialDuplicate(
  client: Client,
  userId: string,
  params: {
    amount: number;
    occurredAt: string;
    cardId?: string | null;
    merchantRaw?: string | null;
    windowMinutes: number;
  },
): Promise<ExpenseRow | null> {
  const center = new Date(params.occurredAt).getTime();
  const windowMs = params.windowMinutes * 60_000;

  let query = client
    .from("expenses")
    .select("*")
    .eq("user_id", userId)
    .eq("amount", params.amount)
    .neq("status", "voided")
    .gte("occurred_at", new Date(center - windowMs).toISOString())
    .lte("occurred_at", new Date(center + windowMs).toISOString());

  if (params.cardId) query = query.eq("card_id", params.cardId);

  const { data, error } = await query.limit(1);
  if (error) throw error;
  return (data?.[0] as ExpenseRow) ?? null;
}

export async function findByExternalRef(
  client: Client,
  userId: string,
  externalRef: string,
): Promise<ExpenseRow | null> {
  const { data, error } = await client
    .from("expenses")
    .select("*")
    .eq("user_id", userId)
    .eq("external_ref", externalRef)
    .maybeSingle();

  if (error) throw error;
  return (data as ExpenseRow) ?? null;
}

/** Gastos de un rango, con relaciones. Alimenta el dashboard y la analítica. */
export async function findExpensesInRange(
  client: Client,
  userId: string,
  from: string,
  to: string,
): Promise<ExpenseWithRelations[]> {
  const { data, error } = await client
    .from("expenses")
    .select(SELECT_WITH_RELATIONS)
    .eq("user_id", userId)
    .eq("status", "confirmed")
    .gte("occurred_at", from)
    .lt("occurred_at", to)
    .order("occurred_at", { ascending: false })
    .limit(5000);

  if (error) throw error;
  return (data ?? []) as unknown as ExpenseWithRelations[];
}

/** Total de un rango, sin traer las filas. Para KPIs. */
export async function sumExpensesInRange(
  client: Client,
  userId: string,
  from: string,
  to: string,
  categoryId?: string | null,
): Promise<{ total: number; count: number }> {
  let query = client
    .from("expenses")
    .select("amount, amount_base")
    .eq("user_id", userId)
    .eq("status", "confirmed")
    .gte("occurred_at", from)
    .lt("occurred_at", to);

  if (categoryId) query = query.eq("category_id", categoryId);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as Array<{ amount: number; amount_base: number | null }>;
  const total = rows.reduce((sum, row) => sum + Number(row.amount_base ?? row.amount), 0);
  return { total: Math.round(total * 100) / 100, count: rows.length };
}

/** Gastos que requieren confirmación del usuario. */
export async function findPendingReview(
  client: Client,
  userId: string,
  limit = 20,
): Promise<ExpenseWithRelations[]> {
  const { data, error } = await client
    .from("expenses")
    .select(SELECT_WITH_RELATIONS)
    .eq("user_id", userId)
    .in("status", ["pending_review", "possible_duplicate"])
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as unknown as ExpenseWithRelations[];
}
