import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/server/supabase/admin";
import { isAuthorizedCron } from "@/server/cron/auth";
import { findProfilesWithWhatsApp } from "@/modules/profile/repository";
import { runRemindersForProfile } from "@/modules/reminders/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron horario de recordatorios.
 *
 * Se ejecuta cada hora porque cada usuario tiene su propia zona horaria y su
 * propia hora preferida de aviso: una única ejecución diaria no puede acertar
 * para todos.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return new NextResponse("No autorizado", { status: 401 });
  }

  const supabase = createAdminClient();

  // Primero se actualizan los vencidos, para que los avisos de "overdue" salgan
  // con el estado correcto.
  await supabase.rpc("mark_overdue_occurrences");

  const profiles = await findProfilesWithWhatsApp(supabase);
  const summary = { profiles: profiles.length, scheduled: 0, sent: 0, failed: 0 };

  for (const profile of profiles) {
    try {
      const result = await runRemindersForProfile(supabase, profile);
      summary.scheduled += result.scheduled;
      summary.sent += result.sent;
      summary.failed += result.failed;
    } catch (error) {
      // Un usuario con datos corruptos no debe impedir que el resto reciba
      // sus recordatorios.
      console.error(`[cron:reminders] fallo con el perfil ${profile.id}:`, error);
      summary.failed++;
    }
  }

  return NextResponse.json({ ok: true, ...summary });
}
