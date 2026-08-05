import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/server/supabase/admin";
import { isAuthorizedCron } from "@/server/cron/auth";
import { findProfilesWithWhatsApp } from "@/modules/profile/repository";
import { generateAndSendReport, reportsDueToday } from "@/modules/reports/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Cron diario de reportes.
 * Cada perfil decide qué reportes recibe y a qué hora; aquí solo se comprueba
 * cuáles corresponden hoy según su configuración y su fecha local.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return new NextResponse("No autorizado", { status: 401 });
  }

  const supabase = createAdminClient();
  const profiles = await findProfilesWithWhatsApp(supabase);

  const summary = { profiles: profiles.length, generated: 0, sent: 0, errors: 0 };

  for (const profile of profiles) {
    const kinds = reportsDueToday(profile);

    for (const kind of kinds) {
      try {
        const result = await generateAndSendReport(supabase, profile, kind);
        if (result.created) summary.generated++;
        if (result.sent) summary.sent++;
      } catch (error) {
        console.error(`[cron:reports] fallo (${profile.id}, ${kind}):`, error);
        summary.errors++;
      }
    }
  }

  // La vista materializada se refresca aquí, aprovechando que es la ejecución
  // menos sensible a la latencia.
  await supabase.rpc("refresh_monthly_totals");

  return NextResponse.json({ ok: true, ...summary });
}
