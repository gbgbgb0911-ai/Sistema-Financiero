import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, MerchantRow } from "@/types/database";
import { normalizeMerchantName, titleCase } from "@/core/text";

type Client = SupabaseClient<Database>;

/**
 * Resuelve un nombre de comercio a una entidad, creándola si no existe.
 *
 * La clave es `normalized_name`: "RAPPI*PERU LIMA 0034" y "Rappi Peru SAC"
 * normalizan a "rappi peru" y comparten la misma fila. Sin esto, el desglose
 * por comercio se llena de variantes del mismo negocio y deja de ser útil.
 */
export async function resolveMerchant(
  client: Client,
  userId: string,
  rawName: string,
): Promise<MerchantRow | null> {
  const normalized = normalizeMerchantName(rawName);
  if (!normalized) return null;

  const { data: existing, error: findError } = await client
    .from("merchants")
    .select("*")
    .eq("user_id", userId)
    .eq("normalized_name", normalized)
    .maybeSingle();

  if (findError) throw findError;
  if (existing) return existing as MerchantRow;

  const { data, error } = await client
    .from("merchants")
    .insert({
      user_id: userId,
      name: titleCase(normalized),
      normalized_name: normalized,
    })
    .select("*")
    .single();

  // Carrera con otra inserción simultánea (mismo comercio, dos gastos a la vez):
  // la restricción única salta, así que se relee la fila ganadora.
  if (error) {
    if (error.code === "23505") {
      const { data: raced } = await client
        .from("merchants")
        .select("*")
        .eq("user_id", userId)
        .eq("normalized_name", normalized)
        .maybeSingle();
      return (raced as MerchantRow) ?? null;
    }
    throw error;
  }

  return data as MerchantRow;
}

export async function findMerchants(
  client: Client,
  userId: string,
  options: { search?: string; limit?: number } = {},
): Promise<MerchantRow[]> {
  let query = client.from("merchants").select("*").eq("user_id", userId);

  if (options.search) {
    const normalized = normalizeMerchantName(options.search);
    if (normalized) query = query.ilike("normalized_name", `%${normalized}%`);
  }

  const { data, error } = await query
    .order("visit_count", { ascending: false })
    .limit(options.limit ?? 20);

  if (error) throw error;
  return (data ?? []) as MerchantRow[];
}

export async function setMerchantDefaultCategory(
  client: Client,
  userId: string,
  merchantId: string,
  categoryId: string | null,
): Promise<void> {
  const { error } = await client
    .from("merchants")
    .update({ default_category_id: categoryId })
    .eq("user_id", userId)
    .eq("id", merchantId);
  if (error) throw error;
}

export async function markAsSubscription(
  client: Client,
  userId: string,
  merchantId: string,
  isSubscription: boolean,
): Promise<void> {
  const { error } = await client
    .from("merchants")
    .update({ is_subscription: isSubscription })
    .eq("user_id", userId)
    .eq("id", merchantId);
  if (error) throw error;
}
