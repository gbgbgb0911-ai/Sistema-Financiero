import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";

/**
 * Cliente para Server Components, Server Actions y Route Handlers.
 * Opera con la sesión del usuario, así que RLS sigue aplicando: si hubiera un
 * fallo de filtrado en la aplicación, la base de datos igualmente no devuelve
 * filas de otro usuario.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Llamado desde un Server Component: el middleware ya refresca la
            // sesión, así que se puede ignorar sin perder la sesión.
          }
        },
      },
    },
  );
}

/** Usuario autenticado o `null`. */
export async function getSessionUser() {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

/** Igual que `getSessionUser` pero lanza si no hay sesión. Para Server Actions. */
export async function requireUser() {
  const user = await getSessionUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}
