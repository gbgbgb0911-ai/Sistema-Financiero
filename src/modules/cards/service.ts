import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, CardRow } from "@/types/database";
import { DomainError } from "@/core/errors";
import {
  currentStatementCycle,
  cardUtilization,
  estimateMinimumPayment,
  type StatementCycle,
  type CardUtilization,
} from "@/core/statements";
import type { CardInput, CardUpdate } from "./schema";
import * as repo from "./repository";

type Client = SupabaseClient<Database>;

export interface CardWithBalance {
  card: CardRow;
  /** Consumido en el ciclo de facturación vigente. */
  currentBalance: number;
  cycle: StatementCycle | null;
  utilization: CardUtilization;
  minimumPayment: number;
}

export async function createCard(
  client: Client,
  userId: string,
  input: CardInput,
): Promise<CardRow> {
  if (input.isDefault) await repo.clearDefaultFlag(client, userId);

  return repo.insertCard(client, {
    user_id: userId,
    name: input.name,
    kind: input.kind,
    issuer: input.issuer ?? null,
    last4: input.last4 ?? null,
    currency: input.currency,
    credit_limit: input.creditLimit ?? null,
    statement_day: input.statementDay ?? null,
    due_day: input.dueDay ?? null,
    color: input.color,
    is_default: input.isDefault,
  });
}

export async function updateCardById(
  client: Client,
  userId: string,
  input: CardUpdate,
): Promise<CardRow> {
  const { id, ...rest } = input;

  const current = await repo.findCardById(client, userId, id);
  if (!current) throw DomainError.notFound("la tarjeta");

  if (rest.isDefault) await repo.clearDefaultFlag(client, userId);

  return repo.updateCard(client, userId, id, {
    ...(rest.name !== undefined ? { name: rest.name } : {}),
    ...(rest.kind !== undefined ? { kind: rest.kind } : {}),
    ...(rest.issuer !== undefined ? { issuer: rest.issuer } : {}),
    ...(rest.last4 !== undefined ? { last4: rest.last4 } : {}),
    ...(rest.currency !== undefined ? { currency: rest.currency } : {}),
    ...(rest.creditLimit !== undefined ? { credit_limit: rest.creditLimit } : {}),
    ...(rest.statementDay !== undefined ? { statement_day: rest.statementDay } : {}),
    ...(rest.dueDay !== undefined ? { due_day: rest.dueDay } : {}),
    ...(rest.color !== undefined ? { color: rest.color } : {}),
    ...(rest.isDefault !== undefined ? { is_default: rest.isDefault } : {}),
  });
}

export async function archiveCard(client: Client, userId: string, id: string): Promise<void> {
  await repo.updateCard(client, userId, id, { archived_at: new Date().toISOString() });
}

/**
 * Saldo de una tarjeta.
 *
 * Para tarjetas de crédito con ciclo configurado se devuelve lo consumido en el
 * ciclo vigente, que es lo que el usuario entiende por "cuánto debo". La suma
 * histórica de todos los consumos no responde esa pregunta.
 */
export async function getCardWithBalance(
  client: Client,
  userId: string,
  card: CardRow,
  reference = new Date(),
): Promise<CardWithBalance> {
  let cycle: StatementCycle | null = null;
  let from: Date;
  let to: Date;

  if (card.kind === "credit" && card.statement_day && card.due_day) {
    cycle = currentStatementCycle(card.statement_day, card.due_day, reference);
    from = cycle.start;
    to = cycle.end;
  } else {
    // Sin ciclo definido se usa el mes natural.
    from = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1));
    to = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 0, 23, 59, 59));
  }

  const currentBalance = await repo.sumCardSpending(
    client,
    userId,
    card.id,
    from.toISOString(),
    to.toISOString(),
  );

  return {
    card,
    currentBalance,
    cycle,
    utilization: cardUtilization(currentBalance, card.credit_limit),
    minimumPayment: estimateMinimumPayment(currentBalance),
  };
}

export async function listCardsWithBalance(
  client: Client,
  userId: string,
): Promise<CardWithBalance[]> {
  const cards = await repo.findCards(client, userId);
  return Promise.all(cards.map((card) => getCardWithBalance(client, userId, card)));
}

export { repo as cardRepository };
