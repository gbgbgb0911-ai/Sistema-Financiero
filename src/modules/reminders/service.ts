import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ProfileRow } from "@/types/database";
import { reminderSchedule } from "@/core/recurrence";
import { zonedToUtc, zonedNow, addDays } from "@/core/dates";
import { formatMoney } from "@/core/money";
import { sendWhatsAppButtons } from "@/server/whatsapp/client";
import { findUpcomingOccurrences } from "@/modules/payments/repository";

type Client = SupabaseClient<Database>;

export interface ReminderRunResult {
  scheduled: number;
  sent: number;
  failed: number;
}

/**
 * Genera los recordatorios pendientes de los próximos vencimientos.
 *
 * Es idempotente por diseño: `UNIQUE(occurrence_id, kind)` en la base hace que
 * reejecutar el cron no envíe nada dos veces. Sin esa restricción, un cron que
 * se solape o un reintento produciría spam al usuario.
 */
export async function scheduleReminders(
  client: Client,
  profile: ProfileRow,
): Promise<number> {
  const reminderHour = profile.notification_prefs?.reminder_hour ?? 9;

  const today = zonedNow(profile.timezone).toISOString().slice(0, 10);
  const horizon = addDays(new Date(), 10).toISOString().slice(0, 10);

  const occurrences = await findUpcomingOccurrences(client, profile.id, {
    from: today,
    to: horizon,
    limit: 100,
  });

  let scheduled = 0;

  for (const occurrence of occurrences) {
    const reminderDays = occurrence.payment?.reminder_days ?? [1, 0];
    const schedule = reminderSchedule(occurrence.due_date, reminderDays, reminderHour);

    for (const entry of schedule) {
      // La hora local del usuario se convierte al instante UTC real. Enviar un
      // recordatorio "a las 9" tiene que significar las 9 de su mañana.
      const localMoment = new Date(`${entry.date}T${String(entry.hour).padStart(2, "0")}:00:00Z`);
      const scheduledFor = zonedToUtc(localMoment, profile.timezone);

      // No se programan recordatorios en el pasado: al activar un pago antiguo
      // se dispararían todos de golpe.
      if (scheduledFor.getTime() < Date.now() - 3_600_000) continue;

      const { error } = await client.from("reminders").insert({
        user_id: profile.id,
        occurrence_id: occurrence.id,
        kind: entry.kind,
        scheduled_for: scheduledFor.toISOString(),
        channel: "whatsapp",
      });

      // 23505 = ya existía. Es el caso normal al reejecutar el cron.
      if (!error) scheduled++;
      else if (error.code !== "23505") {
        console.error("[reminders] no se pudo programar:", error.message);
      }
    }
  }

  return scheduled;
}

/** Envía los recordatorios cuya hora ya llegó. */
export async function dispatchDueReminders(
  client: Client,
  profile: ProfileRow,
): Promise<{ sent: number; failed: number }> {
  if (!profile.whatsapp_opt_in || !profile.phone_e164) {
    return { sent: 0, failed: 0 };
  }

  const { data, error } = await client
    .from("reminders")
    .select(
      `
      id, kind, occurrence_id,
      occurrence:payment_occurrences!reminders_occurrence_id_fkey (
        id, due_date, amount, currency, status,
        payment:payments!payment_occurrences_payment_id_fkey (name)
      )
    `,
    )
    .eq("user_id", profile.id)
    .is("sent_at", null)
    .lte("scheduled_for", new Date().toISOString())
    .limit(20);

  if (error) throw error;

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    kind: string;
    occurrence_id: string;
    occurrence: {
      id: string;
      due_date: string;
      amount: number;
      currency: "PEN" | "USD" | "EUR";
      status: string;
      payment: { name: string } | null;
    } | null;
  }>;

  let sent = 0;
  let failed = 0;

  for (const reminder of rows) {
    const occurrence = reminder.occurrence;

    // Si ya se pagó entre la programación y el envío, se marca el recordatorio
    // como resuelto sin molestar al usuario.
    if (!occurrence || occurrence.status !== "pending") {
      await client
        .from("reminders")
        .update({ sent_at: new Date().toISOString() })
        .eq("id", reminder.id);
      continue;
    }

    const amount = formatMoney(Number(occurrence.amount), occurrence.currency, profile.locale);
    const name = occurrence.payment?.name ?? "Pago";

    const body =
      reminder.kind === "day_before"
        ? `Mañana vence *${name}*: ${amount}.`
        : reminder.kind === "overdue"
          ? `*${name}* venció ayer y sigue pendiente: ${amount}.`
          : `Hoy vence *${name}*: ${amount}.`;

    const result = await sendWhatsAppButtons(profile.phone_e164, body, [
      { id: `pay:${occurrence.id}`, title: "Pagado" },
      { id: `snooze:${occurrence.id}`, title: "Más tarde" },
      { id: `postpone:${occurrence.id}`, title: "Posponer" },
    ]);

    await client.from("notifications").insert({
      user_id: profile.id,
      reminder_id: reminder.id,
      channel: "whatsapp",
      status: result.ok ? "sent" : "failed",
      body,
      provider_message_id: result.messageId,
      error: result.error ?? null,
      sent_at: result.ok ? new Date().toISOString() : null,
    });

    if (result.ok) {
      await client
        .from("reminders")
        .update({ sent_at: new Date().toISOString() })
        .eq("id", reminder.id);
      sent++;
    } else {
      failed++;
    }
  }

  return { sent, failed };
}

/** Ciclo completo para un usuario: marcar vencidos, programar y enviar. */
export async function runRemindersForProfile(
  client: Client,
  profile: ProfileRow,
): Promise<ReminderRunResult> {
  const scheduled = await scheduleReminders(client, profile);
  const { sent, failed } = await dispatchDueReminders(client, profile);
  return { scheduled, sent, failed };
}
