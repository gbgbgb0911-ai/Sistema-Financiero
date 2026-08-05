import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, PaymentRow, PaymentOccurrenceRow } from "@/types/database";
import { DomainError } from "@/core/errors";
import { addDays } from "@/core/dates";
import { createExpense } from "@/modules/expenses/service";
import type { PaymentInput, PaymentUpdate, OccurrenceAction } from "./schema";
import * as repo from "./repository";

type Client = SupabaseClient<Database>;

export async function createPayment(
  client: Client,
  userId: string,
  input: PaymentInput,
): Promise<PaymentRow> {
  const payment = await repo.insertPayment(client, {
    user_id: userId,
    name: input.name,
    amount: input.amount,
    currency: input.currency,
    category_id: input.categoryId ?? null,
    card_id: input.cardId ?? null,
    frequency: input.frequency,
    anchor_date: input.anchorDate,
    end_date: input.endDate ?? null,
    reminder_days: input.reminderDays,
    auto_create_expense: input.autoCreateExpense,
    notes: input.notes ?? null,
  });

  // El trigger de la base de datos ya materializa; se repite aquí para cubrir
  // el caso de un despliegue con migraciones parciales, y es idempotente.
  await repo.materializeOccurrences(client, payment.id);

  return payment;
}

export async function updatePaymentById(
  client: Client,
  userId: string,
  input: PaymentUpdate,
): Promise<PaymentRow> {
  const { id, ...rest } = input;

  const current = await repo.findPaymentById(client, userId, id);
  if (!current) throw DomainError.notFound("el pago");

  const payment = await repo.updatePayment(client, userId, id, {
    ...(rest.name !== undefined ? { name: rest.name } : {}),
    ...(rest.amount !== undefined ? { amount: rest.amount } : {}),
    ...(rest.currency !== undefined ? { currency: rest.currency } : {}),
    ...(rest.categoryId !== undefined ? { category_id: rest.categoryId } : {}),
    ...(rest.cardId !== undefined ? { card_id: rest.cardId } : {}),
    ...(rest.frequency !== undefined ? { frequency: rest.frequency } : {}),
    ...(rest.anchorDate !== undefined ? { anchor_date: rest.anchorDate } : {}),
    ...(rest.endDate !== undefined ? { end_date: rest.endDate } : {}),
    ...(rest.reminderDays !== undefined ? { reminder_days: rest.reminderDays } : {}),
    ...(rest.autoCreateExpense !== undefined
      ? { auto_create_expense: rest.autoCreateExpense }
      : {}),
    ...(rest.notes !== undefined ? { notes: rest.notes } : {}),
    ...(rest.isActive !== undefined ? { is_active: rest.isActive } : {}),
  });

  // Si cambió la regla, se regeneran las ocurrencias futuras pendientes.
  const scheduleChanged =
    rest.frequency !== undefined || rest.anchorDate !== undefined || rest.endDate !== undefined;

  if (scheduleChanged) {
    await client
      .from("payment_occurrences")
      .delete()
      .eq("user_id", userId)
      .eq("payment_id", id)
      .eq("status", "pending")
      .gte("due_date", new Date().toISOString().slice(0, 10));

    await repo.materializeOccurrences(client, id);
  }

  return payment;
}

export async function deactivatePayment(
  client: Client,
  userId: string,
  id: string,
): Promise<void> {
  await repo.updatePayment(client, userId, id, { is_active: false });

  // Las ocurrencias futuras se cancelan; las pasadas se conservan como histórico.
  await client
    .from("payment_occurrences")
    .update({ status: "canceled" })
    .eq("user_id", userId)
    .eq("payment_id", id)
    .eq("status", "pending")
    .gte("due_date", new Date().toISOString().slice(0, 10));
}

export interface OccurrenceActionResult {
  occurrence: PaymentOccurrenceRow;
  /** Gasto creado al marcar como pagado, si el pago lo tiene activado. */
  expenseId?: string;
  message: string;
}

/**
 * Aplica una acción sobre una ocurrencia.
 *
 * Es el punto único donde convergen la interfaz web y las respuestas de
 * WhatsApp ("pagado", "posponer 3 días", "cancelar"). Tener una sola
 * implementación evita que ambos caminos diverjan.
 */
export async function applyOccurrenceAction(
  client: Client,
  userId: string,
  input: OccurrenceAction,
): Promise<OccurrenceActionResult> {
  const occurrence = await repo.findOccurrenceById(client, userId, input.occurrenceId);
  if (!occurrence) throw DomainError.notFound("el vencimiento");

  switch (input.action) {
    case "pay": {
      if (occurrence.status === "paid") {
        return {
          occurrence,
          message: `${occurrence.payment?.name ?? "El pago"} ya estaba registrado como pagado.`,
        };
      }

      let expenseId: string | undefined;

      if (occurrence.payment?.auto_create_expense) {
        const result = await createExpense(
          client,
          userId,
          {
            amount: Number(occurrence.amount),
            currency: occurrence.currency,
            categoryId: occurrence.payment.category_id,
            cardId: occurrence.payment.card_id,
            merchantName: occurrence.payment.name,
            description: `Pago: ${occurrence.payment.name}`,
            occurredAt: new Date().toISOString(),
            fxRate: 1,
          },
          { source: "recurring" },
        );
        expenseId = result.expense.id;
      }

      const updated = await repo.updateOccurrence(client, userId, occurrence.id, {
        status: "paid",
        paid_at: new Date().toISOString(),
        ...(expenseId ? { expense_id: expenseId } : {}),
      });

      return {
        occurrence: updated,
        expenseId,
        message: `Anotado. ${occurrence.payment?.name ?? "Pago"} marcado como pagado.`,
      };
    }

    case "snooze": {
      // Solo reprograma el recordatorio; la fecha de vencimiento no cambia.
      const hours = input.value ?? 3;
      const nextReminder = new Date(Date.now() + hours * 3_600_000);

      await client
        .from("reminders")
        .insert({
          user_id: userId,
          occurrence_id: occurrence.id,
          kind: "snoozed",
          scheduled_for: nextReminder.toISOString(),
          channel: "whatsapp",
        })
        .select()
        // Si ya existía un aplazamiento, se ignora el conflicto.
        .maybeSingle();

      return {
        occurrence,
        message: `De acuerdo, te lo recuerdo en ${hours} ${hours === 1 ? "hora" : "horas"}.`,
      };
    }

    case "postpone": {
      // Aquí sí se mueve el vencimiento.
      const days = input.value ?? 3;
      const newDueDate = addDays(new Date(`${occurrence.due_date}T00:00:00Z`), days);
      const newDueISO = newDueDate.toISOString().slice(0, 10);

      const updated = await repo.updateOccurrence(client, userId, occurrence.id, {
        due_date: newDueISO,
        status: "pending",
      });

      // Los recordatorios ya enviados dejan de ser válidos.
      await client
        .from("reminders")
        .delete()
        .eq("user_id", userId)
        .eq("occurrence_id", occurrence.id)
        .is("sent_at", null);

      return {
        occurrence: updated,
        message: `Listo. ${occurrence.payment?.name ?? "El pago"} se pospuso ${days} ${
          days === 1 ? "día" : "días"
        }, ahora vence el ${newDueISO}.`,
      };
    }

    case "skip": {
      const updated = await repo.updateOccurrence(client, userId, occurrence.id, {
        status: "skipped",
      });
      return {
        occurrence: updated,
        message: `Omitido. No te recordaré ${occurrence.payment?.name ?? "este pago"} este período.`,
      };
    }

    case "reopen": {
      const updated = await repo.updateOccurrence(client, userId, occurrence.id, {
        status: "pending",
        paid_at: null,
      });
      return { occurrence: updated, message: "Vencimiento reabierto como pendiente." };
    }
  }
}

export async function listPayments(client: Client, userId: string, includeInactive = false) {
  return repo.findPayments(client, userId, { includeInactive });
}

export async function getUpcoming(
  client: Client,
  userId: string,
  daysAhead = 30,
): Promise<repo.OccurrenceWithPayment[]> {
  const today = new Date().toISOString().slice(0, 10);
  const horizon = addDays(new Date(), daysAhead).toISOString().slice(0, 10);
  return repo.findUpcomingOccurrences(client, userId, { from: today, to: horizon });
}

/** Vencimientos ya pasados y aún sin pagar. Se muestran siempre arriba. */
export async function getOverdue(client: Client, userId: string) {
  const today = new Date().toISOString().slice(0, 10);
  return repo.findUpcomingOccurrences(client, userId, {
    to: today,
    statuses: ["pending", "overdue"],
  });
}

export { repo as paymentRepository };
