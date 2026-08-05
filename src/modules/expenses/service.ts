import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ExpenseRow, ExpenseSource } from "@/types/database";
import { DomainError } from "@/core/errors";
import { DUPLICATE_WINDOW_MINUTES } from "@/lib/constants";
import { resolveMerchant } from "@/modules/merchants/repository";
import type { ExpenseInput, ExpenseUpdate, ExpenseFilters } from "./schema";
import * as repo from "./repository";

type Client = SupabaseClient<Database>;

export interface CreateExpenseOptions {
  source?: ExpenseSource;
  externalRef?: string | null;
  confidence?: number | null;
  /** Si es `true`, un posible duplicado se marca en vez de rechazarse. */
  flagDuplicates?: boolean;
  metadata?: Record<string, unknown>;
}

export interface CreateExpenseResult {
  expense: ExpenseRow;
  /** `true` si se detectó un posible duplicado y quedó marcado para revisión. */
  flaggedAsDuplicate: boolean;
  duplicateOf?: string;
}

/**
 * Crea un gasto.
 *
 * Concentra aquí las reglas que deben cumplirse venga de donde venga el gasto
 * (formulario, WhatsApp, correo): resolución del comercio, deduplicación por
 * referencia externa y detección de duplicados por proximidad.
 */
export async function createExpense(
  client: Client,
  userId: string,
  input: ExpenseInput,
  options: CreateExpenseOptions = {},
): Promise<CreateExpenseResult> {
  const {
    source = "manual",
    externalRef = null,
    confidence = null,
    flagDuplicates = false,
    metadata = {},
  } = options;

  // Idempotencia: si el correo ya se procesó, no se vuelve a registrar.
  if (externalRef) {
    const existing = await repo.findByExternalRef(client, userId, externalRef);
    if (existing) {
      return { expense: existing, flaggedAsDuplicate: false };
    }
  }

  let merchantId = input.merchantId ?? null;
  if (!merchantId && input.merchantName) {
    const merchant = await resolveMerchant(client, userId, input.merchantName);
    merchantId = merchant?.id ?? null;
  }

  const occurredAt = input.occurredAt ?? new Date().toISOString();

  let flaggedAsDuplicate = false;
  let duplicateOf: string | undefined;

  if (flagDuplicates) {
    const duplicate = await repo.findPotentialDuplicate(client, userId, {
      amount: input.amount,
      occurredAt,
      cardId: input.cardId,
      merchantRaw: input.merchantName,
      windowMinutes: DUPLICATE_WINDOW_MINUTES,
    });
    if (duplicate) {
      flaggedAsDuplicate = true;
      duplicateOf = duplicate.id;
    }
  }

  const expense = await repo.insertExpense(client, {
    user_id: userId,
    merchant_id: merchantId,
    category_id: input.categoryId ?? null,
    card_id: input.cardId ?? null,
    amount: input.amount,
    currency: input.currency,
    fx_rate: input.fxRate,
    occurred_at: occurredAt,
    description: input.description ?? null,
    merchant_raw: input.merchantName ?? null,
    notes: input.notes ?? null,
    source,
    // Un duplicado detectado no se descarta: se registra marcado para que el
    // usuario decida. Descartar en silencio pierde gastos legítimos (dos cafés
    // iguales el mismo día son plausibles).
    status: flaggedAsDuplicate ? "possible_duplicate" : "confirmed",
    confidence,
    external_ref: externalRef,
    metadata: { ...metadata, ...(duplicateOf ? { duplicate_of: duplicateOf } : {}) },
  });

  return { expense, flaggedAsDuplicate, duplicateOf };
}

export async function updateExpenseById(
  client: Client,
  userId: string,
  input: ExpenseUpdate,
): Promise<ExpenseRow> {
  const { id, merchantName, ...rest } = input;

  const current = await repo.findExpenseById(client, userId, id);
  if (!current) throw DomainError.notFound("el gasto");

  let merchantId: string | null | undefined = rest.merchantId ?? undefined;
  if (merchantName !== undefined) {
    const merchant = merchantName ? await resolveMerchant(client, userId, merchantName) : null;
    merchantId = merchant?.id ?? null;
  }

  return repo.updateExpense(client, userId, id, {
    ...(rest.amount !== undefined ? { amount: rest.amount } : {}),
    ...(rest.currency !== undefined ? { currency: rest.currency } : {}),
    ...(rest.categoryId !== undefined ? { category_id: rest.categoryId } : {}),
    ...(rest.cardId !== undefined ? { card_id: rest.cardId } : {}),
    ...(merchantId !== undefined ? { merchant_id: merchantId } : {}),
    ...(rest.occurredAt !== undefined ? { occurred_at: rest.occurredAt } : {}),
    ...(rest.description !== undefined ? { description: rest.description } : {}),
    ...(rest.notes !== undefined ? { notes: rest.notes } : {}),
    ...(rest.status !== undefined ? { status: rest.status } : {}),
    ...(merchantName !== undefined ? { merchant_raw: merchantName || null } : {}),
    // amount_base se recalcula en el trigger cuando cambia el importe.
    ...(rest.amount !== undefined ? { amount_base: null } : {}),
  });
}

export async function listExpenses(client: Client, userId: string, filters: ExpenseFilters) {
  return repo.findExpenses(client, userId, filters);
}

export async function getExpense(client: Client, userId: string, id: string) {
  const expense = await repo.findExpenseById(client, userId, id);
  if (!expense) throw DomainError.notFound("el gasto");
  return expense;
}

export async function deleteExpense(client: Client, userId: string, id: string): Promise<void> {
  await repo.voidExpense(client, userId, id);
}

/** Confirma un gasto pendiente de revisión (venido de correo o de la IA). */
export async function confirmExpense(
  client: Client,
  userId: string,
  id: string,
  categoryId?: string | null,
): Promise<ExpenseRow> {
  return repo.updateExpense(client, userId, id, {
    status: "confirmed",
    ...(categoryId !== undefined ? { category_id: categoryId } : {}),
  });
}

export async function getPendingReview(client: Client, userId: string) {
  return repo.findPendingReview(client, userId);
}

export { repo as expenseRepository };
