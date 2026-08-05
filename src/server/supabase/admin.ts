import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Cliente con service role: **salta RLS**.
 *
 * Solo debe usarse en rutas de servidor sin sesión de usuario (webhooks, crons),
 * y siempre filtrando explícitamente por `user_id`. Nunca importar desde un
 * componente de cliente.
 */
export function createAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY no está configurada. " +
        "Es necesaria para webhooks y tareas programadas.",
    );
  }

  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
