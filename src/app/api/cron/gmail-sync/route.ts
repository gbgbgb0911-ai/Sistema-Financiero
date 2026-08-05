import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/server/supabase/admin";
import { isAuthorizedCron } from "@/server/cron/auth";
import { fetchRecentBankEmails, isGmailConfigured } from "@/server/gmail/client";
import { ingestEmail, loadEmailRules } from "@/modules/email-ingest/service";
import { sendWhatsAppText } from "@/server/whatsapp/client";
import type { ProfileRow, EmailAccountRow } from "@/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Sincronización de correos bancarios.
 *
 * Cada mensaje se deduplica por `gmail_message_id` (UNIQUE con `user_id`), así
 * que ejecutar el sync de más nunca duplica gastos.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return new NextResponse("No autorizado", { status: 401 });
  }

  if (!isGmailConfigured()) {
    return NextResponse.json({ ok: false, reason: "Gmail no está configurado" });
  }

  const supabase = createAdminClient();

  const { data: accounts } = await supabase
    .from("email_accounts")
    .select("*, profile:profiles!email_accounts_user_id_fkey (*)")
    .eq("is_active", true);

  const rows = (accounts ?? []) as unknown as Array<
    EmailAccountRow & { profile: ProfileRow | null }
  >;

  const summary = { accounts: rows.length, processed: 0, created: 0, pending: 0, errors: 0 };

  for (const account of rows) {
    const profile = account.profile;
    if (!profile) continue;

    try {
      // Los tokens se guardan cifrados en la base; se descifran con la función
      // SQL para no exponer nunca la clave a la aplicación.
      const { data: tokens } = await supabase.rpc("decrypt_token" as never, {
        token: account.access_token_enc,
      } as never);

      const accessToken = (tokens as unknown as string) ?? account.access_token_enc;
      if (!accessToken) continue;

      const { data: refreshData } = await supabase.rpc("decrypt_token" as never, {
        token: account.refresh_token_enc,
      } as never);

      const emails = await fetchRecentBankEmails(
        accessToken as string,
        (refreshData as unknown as string) ?? null,
        { maxResults: 25, newerThanDays: 3 },
      );

      const rules = await loadEmailRules(supabase, profile.id);

      for (const email of emails) {
        summary.processed++;

        const result = await ingestEmail(
          supabase,
          profile,
          {
            messageId: email.id,
            from: email.from,
            subject: email.subject,
            body: email.body,
            receivedAt: email.receivedAt,
          },
          rules,
        );

        if (result.status === "created") summary.created++;

        if (result.status === "pending_review" && result.confirmationMessage) {
          summary.pending++;
          if (profile.whatsapp_opt_in && profile.phone_e164) {
            await sendWhatsAppText(profile.phone_e164, result.confirmationMessage);
          }
        }
      }

      await supabase
        .from("email_accounts")
        .update({
          last_synced_at: new Date().toISOString(),
          sync_status: "idle",
          sync_error: null,
        })
        .eq("id", account.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "error desconocido";
      console.error(`[cron:gmail] fallo con la cuenta ${account.id}:`, message);
      summary.errors++;

      await supabase
        .from("email_accounts")
        .update({ sync_status: "error", sync_error: message })
        .eq("id", account.id);
    }
  }

  return NextResponse.json({ ok: true, ...summary });
}
