import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ProfileRow } from "@/types/database";
import { DomainError } from "@/core/errors";
import { DEFAULT_CURRENCY, DEFAULT_LOCALE, DEFAULT_TIMEZONE } from "@/lib/constants";
import type { ProfileUpdate } from "./schema";
import * as repo from "./repository";

type Client = SupabaseClient<Database>;

export async function getProfile(client: Client, userId: string): Promise<ProfileRow> {
  const profile = await repo.findProfile(client, userId);
  if (!profile) throw DomainError.notFound("el perfil");
  return profile;
}

/**
 * Contexto de formateo del usuario, con valores por defecto seguros.
 * Se resuelve una vez por petición y se pasa hacia abajo, en lugar de que cada
 * componente lea la configuración por su cuenta.
 */
export async function getFormatContext(client: Client, userId: string) {
  const profile = await repo.findProfile(client, userId);
  return {
    timezone: profile?.timezone ?? DEFAULT_TIMEZONE,
    currency: profile?.base_currency ?? DEFAULT_CURRENCY,
    locale: profile?.locale ?? DEFAULT_LOCALE,
    profile,
  };
}

export async function updateProfileById(
  client: Client,
  userId: string,
  input: ProfileUpdate,
): Promise<ProfileRow> {
  const current = await getProfile(client, userId);

  return repo.updateProfile(client, userId, {
    ...(input.fullName !== undefined ? { full_name: input.fullName } : {}),
    ...(input.phoneE164 !== undefined ? { phone_e164: input.phoneE164 } : {}),
    ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
    ...(input.baseCurrency !== undefined ? { base_currency: input.baseCurrency } : {}),
    ...(input.locale !== undefined ? { locale: input.locale } : {}),
    ...(input.whatsappOptIn !== undefined ? { whatsapp_opt_in: input.whatsappOptIn } : {}),
    ...(input.notificationPrefs !== undefined
      ? { notification_prefs: { ...current.notification_prefs, ...input.notificationPrefs } }
      : {}),
  });
}

export async function completeOnboarding(client: Client, userId: string): Promise<ProfileRow> {
  return repo.updateProfile(client, userId, { onboarded_at: new Date().toISOString() });
}

export { repo as profileRepository };
