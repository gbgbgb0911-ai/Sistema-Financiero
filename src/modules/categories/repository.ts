import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, CategoryRow, BudgetRow } from "@/types/database";

type Client = SupabaseClient<Database>;

export async function findCategories(
  client: Client,
  userId: string,
  includeArchived = false,
): Promise<CategoryRow[]> {
  let query = client.from("categories").select("*").eq("user_id", userId);
  if (!includeArchived) query = query.is("archived_at", null);

  const { data, error } = await query
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []) as CategoryRow[];
}

export async function findCategoryBySlug(
  client: Client,
  userId: string,
  slug: string,
): Promise<CategoryRow | null> {
  const { data, error } = await client
    .from("categories")
    .select("*")
    .eq("user_id", userId)
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw error;
  return (data as CategoryRow) ?? null;
}

/**
 * Busca una categoría por nombre aproximado.
 * Lo usa la IA cuando el usuario dice "gasté 35 en gasolina" y hay que
 * resolver "gasolina" a una categoría existente.
 */
export async function findCategoryByName(
  client: Client,
  userId: string,
  name: string,
): Promise<CategoryRow | null> {
  const { data, error } = await client
    .from("categories")
    .select("*")
    .eq("user_id", userId)
    .ilike("name", `%${name}%`)
    .is("archived_at", null)
    .limit(1);

  if (error) throw error;
  return (data?.[0] as CategoryRow) ?? null;
}

export async function insertCategory(
  client: Client,
  values: Database["public"]["Tables"]["categories"]["Insert"],
): Promise<CategoryRow> {
  const { data, error } = await client.from("categories").insert(values).select("*").single();
  if (error) throw error;
  return data as CategoryRow;
}

export async function updateCategory(
  client: Client,
  userId: string,
  id: string,
  values: Database["public"]["Tables"]["categories"]["Update"],
): Promise<CategoryRow> {
  const { data, error } = await client
    .from("categories")
    .update(values)
    .eq("user_id", userId)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data as CategoryRow;
}

export async function findBudgets(client: Client, userId: string): Promise<BudgetRow[]> {
  const { data, error } = await client
    .from("budgets")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (error) throw error;
  return (data ?? []) as BudgetRow[];
}

export async function upsertBudget(
  client: Client,
  userId: string,
  values: { categoryId: string | null; period: "weekly" | "monthly"; amount: number; currency: "PEN" | "USD" | "EUR" },
): Promise<BudgetRow> {
  // Se desactiva el anterior y se crea uno nuevo, en lugar de sobrescribir:
  // así el histórico de presupuestos queda registrado.
  let deactivate = client
    .from("budgets")
    .update({ is_active: false })
    .eq("user_id", userId)
    .eq("period", values.period);

  deactivate = values.categoryId
    ? deactivate.eq("category_id", values.categoryId)
    : deactivate.is("category_id", null);

  const { error: deactivateError } = await deactivate;
  if (deactivateError) throw deactivateError;

  const { data, error } = await client
    .from("budgets")
    .insert({
      user_id: userId,
      category_id: values.categoryId,
      period: values.period,
      amount: values.amount,
      currency: values.currency,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as BudgetRow;
}
