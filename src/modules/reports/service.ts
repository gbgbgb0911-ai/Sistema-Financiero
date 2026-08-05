import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ProfileRow, ReportKind } from "@/types/database";
import { resolvePeriod, toISODate, type PeriodKey } from "@/core/dates";
import { formatMoney } from "@/core/money";
import { groupTotals, categoryTrends, topMerchants, comparePeriods } from "@/core/analytics";
import { findExpensesInRange } from "@/modules/expenses/repository";
import { sumPendingOccurrences } from "@/modules/payments/repository";
import { getBudgetStatuses } from "@/modules/categories/service";
import { toExpensePoint } from "@/modules/dashboard/service";
import { getAnthropic, getModel, isAiConfigured } from "@/server/anthropic/client";
import { REPORT_SUMMARY_PROMPT } from "@/server/anthropic/prompts";
import { sendWhatsAppText } from "@/server/whatsapp/client";

type Client = SupabaseClient<Database>;

export interface ReportPayload {
  kind: ReportKind;
  periodStart: string;
  periodEnd: string;
  total: number;
  previousTotal: number;
  changePercent: number | null;
  expenseCount: number;
  byCategory: Array<{ label: string; total: number; percentage: number }>;
  topMerchants: Array<{ label: string; total: number }>;
  trends: Array<{ categoryName: string; absoluteChange: number; change: number | null }>;
  budgetsExceeded: Array<{ categoryName: string; budget: number; spent: number }>;
  upcomingTotal: number;
}

const PERIOD_FOR_KIND: Record<ReportKind, PeriodKey> = {
  daily: "today",
  weekly: "week",
  monthly: "month",
};

/**
 * Calcula el reporte de un período.
 *
 * Todos los agregados se calculan aquí, con funciones puras. El modelo solo
 * redacta el resumen a partir de estas cifras: nunca calcula, así que no puede
 * equivocarse en un número.
 */
export async function buildReport(
  client: Client,
  profile: ProfileRow,
  kind: ReportKind,
  reference: Date = new Date(),
): Promise<ReportPayload> {
  const { current, previous } = resolvePeriod(PERIOD_FOR_KIND[kind], profile.timezone, reference);

  const [currentExpenses, previousExpenses, upcoming, budgets] = await Promise.all([
    findExpensesInRange(client, profile.id, current.from.toISOString(), current.to.toISOString()),
    findExpensesInRange(client, profile.id, previous.from.toISOString(), previous.to.toISOString()),
    sumPendingOccurrences(
      client,
      profile.id,
      toISODate(reference, profile.timezone),
      toISODate(new Date(reference.getTime() + 30 * 86_400_000), profile.timezone),
    ),
    getBudgetStatuses(client, profile.id, profile.timezone),
  ]);

  const currentPoints = currentExpenses.map(toExpensePoint);
  const previousPoints = previousExpenses.map(toExpensePoint);

  const total = Math.round(currentPoints.reduce((s, p) => s + p.amount, 0) * 100) / 100;
  const previousTotal = Math.round(previousPoints.reduce((s, p) => s + p.amount, 0) * 100) / 100;

  const comparison = comparePeriods(total, previousTotal);

  return {
    kind,
    periodStart: toISODate(current.from, profile.timezone),
    periodEnd: toISODate(new Date(current.to.getTime() - 1), profile.timezone),
    total,
    previousTotal,
    changePercent: comparison.change,
    expenseCount: currentPoints.length,
    byCategory: groupTotals(currentPoints, "category")
      .slice(0, 6)
      .map((g) => ({ label: g.label, total: g.total, percentage: Math.round(g.percentage) })),
    topMerchants: topMerchants(currentPoints, 3).map((m) => ({ label: m.label, total: m.total })),
    trends: categoryTrends(currentPoints, previousPoints)
      .slice(0, 3)
      .map((t) => ({
        categoryName: t.categoryName,
        absoluteChange: t.absoluteChange,
        change: t.change,
      })),
    budgetsExceeded: budgets
      .filter((b) => b.level === "exceeded")
      .map((b) => ({ categoryName: b.categoryName, budget: b.budget, spent: b.spent })),
    upcomingTotal: upcoming.total,
  };
}

/**
 * Redacta el resumen en lenguaje natural.
 * Si la IA no está configurada, se genera un texto determinista con las mismas
 * cifras: el reporte sigue siendo útil, solo menos conversacional.
 */
export async function summarizeReport(
  payload: ReportPayload,
  profile: ProfileRow,
): Promise<string> {
  const money = (amount: number) => formatMoney(amount, profile.base_currency, profile.locale);

  if (!isAiConfigured()) {
    return buildFallbackSummary(payload, money);
  }

  try {
    const client = getAnthropic();
    const response = await client.messages.create({
      model: getModel(),
      max_tokens: 1_000,
      output_config: { effort: "low" },
      system: [
        { type: "text", text: REPORT_SUMMARY_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      messages: [
        {
          role: "user",
          content: `Datos del reporte ${payload.kind} (${payload.periodStart} a ${payload.periodEnd}):

Total gastado: ${money(payload.total)} en ${payload.expenseCount} movimientos
Período anterior: ${money(payload.previousTotal)}
Variación: ${payload.changePercent !== null ? `${payload.changePercent.toFixed(1)}%` : "sin comparación"}

Por categoría:
${payload.byCategory.map((c) => `- ${c.label}: ${money(c.total)} (${c.percentage}%)`).join("\n") || "- sin datos"}

Mayores variaciones:
${payload.trends.map((t) => `- ${t.categoryName}: ${t.absoluteChange >= 0 ? "+" : ""}${money(t.absoluteChange)}`).join("\n") || "- sin variaciones"}

Principales comercios:
${payload.topMerchants.map((m) => `- ${m.label}: ${money(m.total)}`).join("\n") || "- sin datos"}

Presupuestos excedidos:
${payload.budgetsExceeded.map((b) => `- ${b.categoryName}: ${money(b.spent)} de ${money(b.budget)}`).join("\n") || "- ninguno"}

Por pagar en 30 días: ${money(payload.upcomingTotal)}`,
        },
      ],
    });

    if (response.stop_reason === "refusal") return buildFallbackSummary(payload, money);

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim();

    return text || buildFallbackSummary(payload, money);
  } catch (error) {
    console.error("[reports] fallo al redactar el resumen:", error);
    return buildFallbackSummary(payload, money);
  }
}

function buildFallbackSummary(payload: ReportPayload, money: (n: number) => string): string {
  const label = { daily: "Hoy", weekly: "Esta semana", monthly: "Este mes" }[payload.kind];

  const changeText =
    payload.changePercent === null
      ? ""
      : payload.changePercent > 0
        ? `, un ${payload.changePercent.toFixed(0)}% más que el período anterior`
        : `, un ${Math.abs(payload.changePercent).toFixed(0)}% menos que el período anterior`;

  const top = payload.byCategory[0];
  const topText = top ? ` Lo que más pesó fue ${top.label} con ${money(top.total)}.` : "";

  const exceeded = payload.budgetsExceeded[0];
  const budgetText = exceeded
    ? ` Ojo: superaste el presupuesto de ${exceeded.categoryName} (${money(exceeded.spent)} de ${money(exceeded.budget)}).`
    : "";

  return `${label} gastaste ${money(payload.total)} en ${payload.expenseCount} movimientos${changeText}.${topText}${budgetText}`;
}

/** Genera, guarda y envía el reporte. Idempotente por `UNIQUE(user, kind, period_start)`. */
export async function generateAndSendReport(
  client: Client,
  profile: ProfileRow,
  kind: ReportKind,
): Promise<{ created: boolean; sent: boolean; summary: string }> {
  const payload = await buildReport(client, profile, kind);

  const { data: existing } = await client
    .from("reports")
    .select("id, sent_at")
    .eq("user_id", profile.id)
    .eq("kind", kind)
    .eq("period_start", payload.periodStart)
    .maybeSingle();

  if (existing?.sent_at) {
    return { created: false, sent: false, summary: "" };
  }

  const summary = await summarizeReport(payload, profile);

  const { data: report } = await client
    .from("reports")
    .upsert(
      {
        user_id: profile.id,
        kind,
        period_start: payload.periodStart,
        period_end: payload.periodEnd,
        payload: payload as unknown as Database["public"]["Tables"]["reports"]["Insert"]["payload"],
        summary_text: summary,
      },
      { onConflict: "user_id,kind,period_start" },
    )
    .select("id")
    .single();

  let sent = false;
  if (profile.whatsapp_opt_in && profile.phone_e164) {
    const result = await sendWhatsAppText(profile.phone_e164, summary);
    sent = result.ok;

    if (sent && report) {
      await client
        .from("reports")
        .update({ sent_at: new Date().toISOString() })
        .eq("id", report.id);
    }
  }

  return { created: true, sent, summary };
}

/** Qué reportes corresponden hoy según las preferencias y la fecha local. */
export function reportsDueToday(profile: ProfileRow, reference = new Date()): ReportKind[] {
  const prefs = profile.notification_prefs ?? {};
  const local = new Date(
    reference.toLocaleString("en-US", { timeZone: profile.timezone }),
  );

  const due: ReportKind[] = [];
  if (prefs.daily_report) due.push("daily");
  // Semanal los lunes, con los datos de la semana que acaba de cerrar.
  if (prefs.weekly_report && local.getDay() === 1) due.push("weekly");
  // Mensual el día 1.
  if (prefs.monthly_report && local.getDate() === 1) due.push("monthly");

  return due;
}
