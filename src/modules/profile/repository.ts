import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ProfileRow } from "@/types/database";

type Client = SupabaseClient<Database>;

export async function findProfile(client: Client, userId: string): Promise<ProfileRow | null> {
  const { data, error } = await client
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return (data as ProfileRow) ?? null;
}

/**
 * Resuelve el perfil a partir del teléfono. Es el primer paso de todo mensaje
 * entrante de WhatsApp: sin esto no se sabe de quién es el gasto.
 * Requiere cliente con service role (el webhook no tiene sesión).
 */
export async function findProfileByPhone(
  client: Client,
  phoneE164: string,
): Promise<ProfileRow | null> {
  const normalized = phoneE164.replace(/^\+/, "");

  const { data, error } = await client
    .from("profiles")
    .select("*")
    .eq("phone_e164", normalized)
    .maybeSingle();

  if (error) throw error;
  return (data as ProfileRow) ?? null;
}

export async function updateProfile(
  client: Client,
  userId: string,
  values: Database["public"]["Tables"]["profiles"]["Update"],
): Promise<ProfileRow> {
  const { data, error } = await client
    .from("profiles")
    .update(values)
    .eq("id", userId)
    .select("*")
    .single();

  if (error) throw error;
  return data as ProfileRow;
}

/** Perfiles con WhatsApp activo. Los usa el cron de recordatorios y reportes. */
export async function findProfilesWithWhatsApp(client: Client): Promise<ProfileRow[]> {
  const { data, error } = await client
    .from("profiles")
    .select("*")
    .eq("whatsapp_opt_in", true)
    .not("phone_e164", "is", null);

  if (error) throw error;
  return (data ?? []) as ProfileRow[];
}
