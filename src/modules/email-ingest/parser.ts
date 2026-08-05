import type { EmailRuleRow, CurrencyCode } from "@/types/database";
import { htmlToText, normalizeMerchantName, titleCase } from "@/core/text";
import { normalizeNumericString, detectCurrency } from "@/core/money";

/**
 * Parser de correos bancarios — nivel 1 (determinista).
 *
 * Reglas por emisor con expresiones regulares nombradas. Es barato, instantáneo
 * y auditable, y cubre la mayor parte del volumen real: una persona recibe
 * correos de tres a cinco emisores distintos. Solo cuando ninguna regla encaja
 * se recurre al modelo (nivel 2), que es lento y cuesta dinero.
 */

export interface EmailInput {
  messageId: string;
  from: string;
  subject: string;
  /** Cuerpo en texto plano o HTML; se normaliza internamente. */
  body: string;
  receivedAt: string;
}

export interface ParsedTransaction {
  amount: number | null;
  currency: CurrencyCode | null;
  merchant: string | null;
  cardLast4: string | null;
  occurredAt: string | null;
  transactionType: "purchase" | "withdrawal" | "transfer" | "payment" | "refund" | "unknown";
  confidence: number;
  /** Qué nivel del parser produjo el resultado. */
  method: "rules" | "llm" | "none";
  ruleId?: string;
  issuerName?: string;
}

/** Selecciona la regla aplicable de mayor prioridad. */
export function matchRule(email: EmailInput, rules: EmailRuleRow[]): EmailRuleRow | null {
  const sorted = [...rules].filter((r) => r.is_active).sort((a, b) => a.priority - b.priority);

  for (const rule of sorted) {
    try {
      if (!new RegExp(rule.from_pattern, "i").test(email.from)) continue;
      if (rule.subject_pattern && !new RegExp(rule.subject_pattern, "i").test(email.subject)) {
        continue;
      }
      return rule;
    } catch {
      // Una regex mal formada en la base no debe tumbar el sync entero:
      // se salta la regla y se sigue con la siguiente.
      continue;
    }
  }
  return null;
}

/** Aplica los extractores de la regla al cuerpo del correo. */
export function parseWithRule(email: EmailInput, rule: EmailRuleRow): ParsedTransaction {
  const text = htmlToText(email.body);
  const extractors = rule.extractors ?? {};

  const capture = (pattern: string | undefined): string | null => {
    if (!pattern) return null;
    try {
      const match = text.match(new RegExp(pattern, "i"));
      return match?.[1]?.trim() ?? null;
    } catch {
      return null;
    }
  };

  // Se prueban soles y dólares por separado: muchos correos peruanos incluyen
  // ambos importes (el original y el convertido) y hay que quedarse con el
  // que realmente se cargó.
  const amountRaw = capture(extractors.amount);
  const amountUsdRaw = capture(extractors.amount_usd);

  let amount: number | null = null;
  let currency: CurrencyCode | null = rule.currency_hint;

  if (amountRaw) {
    amount = normalizeNumericString(amountRaw);
    currency = "PEN";
  } else if (amountUsdRaw) {
    amount = normalizeNumericString(amountUsdRaw);
    currency = "USD";
  }

  if (!currency) currency = detectCurrency(text) ?? "PEN";

  const merchantRaw = capture(extractors.merchant);
  const merchant = merchantRaw ? titleCase(normalizeMerchantName(merchantRaw)) : null;
  const cardLast4 = capture(extractors.card_last4);

  const dateRaw = capture(extractors.datetime);
  const occurredAt = dateRaw ? parseFlexibleDate(dateRaw, text) : null;

  const confidence = scoreConfidence({ amount, merchant, cardLast4, occurredAt });

  return {
    amount,
    currency,
    merchant: merchant || null,
    cardLast4,
    occurredAt: occurredAt ?? email.receivedAt,
    transactionType: inferTransactionType(text, email.subject),
    confidence,
    method: "rules",
    ruleId: rule.id,
    issuerName: rule.issuer_name,
  };
}

/**
 * Confianza de la extracción.
 *
 * El importe pesa más que el resto porque un gasto sin importe no sirve; los
 * demás campos se pueden completar después.
 */
function scoreConfidence(fields: {
  amount: number | null;
  merchant: string | null;
  cardLast4: string | null;
  occurredAt: string | null;
}): number {
  if (!fields.amount || fields.amount <= 0) return 0;

  let score = 0.55; // Base por tener un importe válido
  if (fields.merchant && fields.merchant.length > 2) score += 0.25;
  if (fields.cardLast4) score += 0.1;
  if (fields.occurredAt) score += 0.1;

  return Math.min(Math.round(score * 100) / 100, 1);
}

function inferTransactionType(text: string, subject: string): ParsedTransaction["transactionType"] {
  const haystack = `${subject} ${text}`.toLowerCase();

  if (/retiro|cajero|atm|withdrawal/.test(haystack)) return "withdrawal";
  if (/transferencia|transfer|envio de dinero/.test(haystack)) return "transfer";
  if (/devoluci[oó]n|reverso|refund|anulaci[oó]n/.test(haystack)) return "refund";
  if (/pago de tarjeta|pago tarjeta|card payment/.test(haystack)) return "payment";
  if (/consumo|compra|purchase|cargo/.test(haystack)) return "purchase";

  return "unknown";
}

/**
 * Interpreta las fechas más habituales en correos bancarios.
 * Se asume `DD/MM/YYYY`, que es la convención en Latinoamérica y Europa;
 * interpretarla como `MM/DD` desplazaría casi todos los gastos.
 */
export function parseFlexibleDate(raw: string, context = ""): string | null {
  const trimmed = raw.trim();

  const dmy = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const [, day, month, year] = dmy;
    const timeMatch = context.match(/(\d{2}):(\d{2})/);
    const hours = timeMatch?.[1] ?? "12";
    const minutes = timeMatch?.[2] ?? "00";
    const iso = `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}T${hours}:${minutes}:00`;
    const parsed = new Date(`${iso}Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  // "Mar 15, 2026" (correos internacionales)
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();

  return null;
}

/** Descarta rápidamente lo que claramente no es una notificación de transacción. */
export function looksLikeTransactionEmail(email: EmailInput): boolean {
  const haystack = `${email.subject} ${email.from}`.toLowerCase();

  const negative = /newsletter|promoci[oó]n|encuesta|unsubscribe|estado de cuenta mensual/;
  if (negative.test(haystack)) return false;

  const positive =
    /consumo|compra|cargo|operaci[oó]n|transacci[oó]n|pago|retiro|purchase|transaction|payment/;
  return positive.test(haystack);
}
