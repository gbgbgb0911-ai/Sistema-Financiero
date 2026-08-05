import type { NextRequest } from "next/server";

/**
 * Autenticación de las rutas de cron.
 *
 * Sin esto, cualquiera podría disparar el envío masivo de recordatorios o el
 * consumo de la API de IA. Si `CRON_SECRET` no está configurado, se rechaza
 * todo: fallar cerrado es la única opción aceptable aquí.
 */
export function isAuthorizedCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}
