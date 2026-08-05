import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, EmailRuleRow, ProfileRow } from "@/types/database";
import { EMAIL_CONFIDENCE_THRESHOLD } from "@/lib/constants";
import { createExpense } from "@/modules/expenses/service";
import { findCardByLast4 } from "@/modules/cards/repository";
import { formatMoney } from "@/core/money";
import {
  matchRule,
  parseWithRule,
  looksLikeTransactionEmail,
  type EmailInput,
  type ParsedTransaction,
} from "./parser";
import { parseWithLlm } from "./llm-parser";

type Client = SupabaseClient<Database>;

export interface IngestResult {
  status: "created" | "pending_review" | "duplicate" | "skipped" | "failed";
  expenseId?: string;
  parsed?: ParsedTransaction;
  /** Mensaje a enviar por WhatsApp cuando hace falta confirmación. */
  confirmationMessage?: string;
  reason?: string;
}

/**
 * Procesa un correo entrante y lo convierte en gasto.
 *
 * Cascada de tres niveles:
 *   1. Reglas deterministas (barato, instantáneo, auditable).
 *   2. Extracción con el modelo si ninguna regla encaja.
 *   3. Confirmación humana por WhatsApp si la confianza es baja.
 *
 * Nunca se descarta en silencio un correo que parece una transacción: o se
 * registra, o se pregunta.
 */
export async function ingestEmail(
  client: Client,
  profile: ProfileRow,
  email: EmailInput,
  rules: EmailRuleRow[],
): Promise<IngestResult> {
  if (!looksLikeTransactionEmail(email)) {
    return { status: "skipped", reason: "No parece una notificación de transacción" };
  }

  // Nivel 1: reglas.
  let parsed: ParsedTransaction | null = null;
  const rule = matchRule(email, rules);

  if (rule) {
    parsed = parseWithRule(email, rule);
    await bumpRuleCounter(client, rule.id, parsed.confidence > 0 ? "hit" : "miss");
  }

  // Nivel 2: modelo, si no hubo regla o la extracción salió pobre.
  if (!parsed || !parsed.amount || parsed.confidence < 0.5) {
    const llmResult = await parseWithLlm(email);
    // Se queda el mejor de los dos, no simplemente el último.
    if (llmResult && (!parsed || llmResult.confidence > parsed.confidence)) {
      parsed = llmResult;
    }
  }

  if (!parsed || !parsed.amount || parsed.amount <= 0) {
    return { status: "skipped", reason: "No se pudo extraer un importe válido" };
  }

  // Las devoluciones no son gastos; registrarlas como tal falsearía los totales.
  if (parsed.transactionType === "refund") {
    return { status: "skipped", reason: "Es una devolución, no un gasto" };
  }

  let cardId: string | null = null;
  if (parsed.cardLast4) {
    const card = await findCardByLast4(client, profile.id, parsed.cardLast4);
    cardId = card?.id ?? null;
  }

  const needsReview = parsed.confidence < EMAIL_CONFIDENCE_THRESHOLD;

  const result = await createExpense(
    client,
    profile.id,
    {
      amount: parsed.amount,
      currency: parsed.currency ?? profile.base_currency,
      merchantName: parsed.merchant ?? undefined,
      cardId,
      occurredAt: parsed.occurredAt ?? email.receivedAt,
      description: parsed.issuerName ? `Detectado en correo de ${parsed.issuerName}` : undefined,
      fxRate: 1,
    },
    {
      source: "email",
      externalRef: email.messageId,
      confidence: parsed.confidence,
      // Los correos de pre-autorización y de consumo llegan por separado para
      // la misma compra: se marca el duplicado en vez de crear dos gastos.
      flagDuplicates: true,
      metadata: {
        parser_method: parsed.method,
        issuer: parsed.issuerName ?? null,
        email_subject: email.subject,
      },
    },
  );

  if (result.flaggedAsDuplicate) {
    return { status: "duplicate", expenseId: result.expense.id, parsed };
  }

  if (needsReview) {
    // Se deja pendiente de revisión y se pregunta por WhatsApp.
    await client
      .from("expenses")
      .update({ status: "pending_review" })
      .eq("id", result.expense.id)
      .eq("user_id", profile.id);

    const amountText = formatMoney(
      parsed.amount,
      parsed.currency ?? profile.base_currency,
      profile.locale,
    );

    return {
      status: "pending_review",
      expenseId: result.expense.id,
      parsed,
      confirmationMessage:
        `Detecté ${amountText}` +
        (parsed.merchant ? ` en ${parsed.merchant}` : "") +
        (parsed.cardLast4 ? ` con tu tarjeta *${parsed.cardLast4}` : "") +
        `. ¿Lo registro? Responde Sí o No.`,
    };
  }

  return { status: "created", expenseId: result.expense.id, parsed };
}

/**
 * Contadores de aciertos y fallos por regla.
 *
 * Es la señal que permite detectar que un banco cambió el formato de sus
 * correos antes de que el usuario note que faltan gastos.
 */
async function bumpRuleCounter(
  client: Client,
  ruleId: string,
  kind: "hit" | "miss",
): Promise<void> {
  const { data } = await client
    .from("email_rules")
    .select("hit_count, miss_count")
    .eq("id", ruleId)
    .maybeSingle();

  if (!data) return;

  await client
    .from("email_rules")
    .update(
      kind === "hit"
        ? { hit_count: (data.hit_count ?? 0) + 1 }
        : { miss_count: (data.miss_count ?? 0) + 1 },
    )
    .eq("id", ruleId);
}

export async function loadEmailRules(client: Client, userId: string): Promise<EmailRuleRow[]> {
  const { data, error } = await client
    .from("email_rules")
    .select("*")
    .or(`user_id.is.null,user_id.eq.${userId}`)
    .eq("is_active", true)
    .order("priority", { ascending: true });

  if (error) throw error;
  return (data ?? []) as EmailRuleRow[];
}
