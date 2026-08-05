/**
 * Analítica financiera: agregados, tendencias, anomalías y suscripciones.
 *
 * Todo son funciones puras sobre arrays. Esto es lo que alimenta tanto los
 * gráficos del dashboard como las respuestas de la IA — y lo que permite
 * testear la lógica de "¿en qué gasto demasiado?" sin levantar la base de datos.
 */

import { percentChange } from "./money";

export interface ExpensePoint {
  id: string;
  amount: number;
  occurredAt: string;
  categoryId: string | null;
  categoryName: string | null;
  merchantId: string | null;
  merchantName: string | null;
  cardId: string | null;
  cardName: string | null;
}

export interface GroupTotal {
  key: string;
  label: string;
  total: number;
  count: number;
  percentage: number;
}

/** Agrupa y ordena de mayor a menor, con el porcentaje sobre el total. */
export function groupTotals(
  expenses: ExpensePoint[],
  by: "category" | "merchant" | "card",
): GroupTotal[] {
  const accumulator = new Map<string, { label: string; total: number; count: number }>();

  for (const expense of expenses) {
    const [key, label] =
      by === "category"
        ? [expense.categoryId ?? "uncategorized", expense.categoryName ?? "Sin categoría"]
        : by === "merchant"
          ? [expense.merchantId ?? "unknown", expense.merchantName ?? "Sin comercio"]
          : [expense.cardId ?? "unknown", expense.cardName ?? "Sin método"];

    const entry = accumulator.get(key) ?? { label, total: 0, count: 0 };
    entry.total += expense.amount;
    entry.count += 1;
    accumulator.set(key, entry);
  }

  const grandTotal = [...accumulator.values()].reduce((sum, e) => sum + e.total, 0);

  return [...accumulator.entries()]
    .map(([key, entry]) => ({
      key,
      label: entry.label,
      total: Math.round(entry.total * 100) / 100,
      count: entry.count,
      percentage: grandTotal > 0 ? (entry.total / grandTotal) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

export interface DailySeriesPoint {
  date: string;
  total: number;
  count: number;
  /** Media móvil de 7 días. Suaviza el ruido diario para ver la tendencia real. */
  movingAverage: number;
}

export function dailySeries(
  expenses: ExpensePoint[],
  days: string[],
  timezone: string,
): DailySeriesPoint[] {
  const byDay = new Map<string, { total: number; count: number }>();

  for (const expense of expenses) {
    const day = isoDateInZone(new Date(expense.occurredAt), timezone);
    const entry = byDay.get(day) ?? { total: 0, count: 0 };
    entry.total += expense.amount;
    entry.count += 1;
    byDay.set(day, entry);
  }

  const series = days.map((date) => {
    const entry = byDay.get(date) ?? { total: 0, count: 0 };
    return {
      date,
      total: Math.round(entry.total * 100) / 100,
      count: entry.count,
      movingAverage: 0,
    };
  });

  const WINDOW = 7;
  for (let i = 0; i < series.length; i++) {
    const start = Math.max(0, i - WINDOW + 1);
    const window = series.slice(start, i + 1);
    const sum = window.reduce((acc, point) => acc + point.total, 0);
    series[i]!.movingAverage = Math.round((sum / window.length) * 100) / 100;
  }

  return series;
}

function isoDateInZone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return parts;
}

export interface PeriodComparison {
  current: number;
  previous: number;
  change: number | null;
  direction: "up" | "down" | "flat";
}

export function comparePeriods(current: number, previous: number): PeriodComparison {
  const change = percentChange(current, previous);
  const direction: PeriodComparison["direction"] =
    change === null || Math.abs(change) < 1 ? "flat" : change > 0 ? "up" : "down";
  return { current, previous, change, direction };
}

export interface CategoryTrend {
  categoryId: string;
  categoryName: string;
  current: number;
  previous: number;
  change: number | null;
  absoluteChange: number;
}

/**
 * Categorías ordenadas por variación absoluta.
 *
 * Se ordena por el cambio en importe, no en porcentaje: pasar de S/10 a S/20
 * es +100% pero irrelevante; pasar de S/800 a S/1000 es +25% y sí importa.
 */
export function categoryTrends(
  current: ExpensePoint[],
  previous: ExpensePoint[],
): CategoryTrend[] {
  const currentTotals = groupTotals(current, "category");
  const previousTotals = new Map(groupTotals(previous, "category").map((g) => [g.key, g.total]));

  const trends: CategoryTrend[] = currentTotals.map((group) => {
    const before = previousTotals.get(group.key) ?? 0;
    return {
      categoryId: group.key,
      categoryName: group.label,
      current: group.total,
      previous: before,
      change: percentChange(group.total, before),
      absoluteChange: Math.round((group.total - before) * 100) / 100,
    };
  });

  // Categorías que existían antes y desaparecieron: también son señal.
  for (const [key, total] of previousTotals) {
    if (!currentTotals.some((g) => g.key === key)) {
      trends.push({
        categoryId: key,
        categoryName: "Sin categoría",
        current: 0,
        previous: total,
        change: -100,
        absoluteChange: -total,
      });
    }
  }

  return trends.sort((a, b) => Math.abs(b.absoluteChange) - Math.abs(a.absoluteChange));
}

export interface Anomaly {
  expenseId: string;
  amount: number;
  categoryName: string;
  /** Cuántas desviaciones típicas por encima de la media de su categoría. */
  deviations: number;
  categoryAverage: number;
}

/**
 * Gastos atípicos dentro de su propia categoría.
 *
 * Se compara cada gasto contra la media de su categoría, no contra la media
 * global: S/300 en un restaurante es anómalo, S/300 en alquiler no lo es.
 * Se exige un mínimo de muestras por categoría para que la desviación signifique algo.
 */
export function detectAnomalies(
  expenses: ExpensePoint[],
  threshold = 2.5,
  minSamples = 5,
): Anomaly[] {
  const byCategory = new Map<string, ExpensePoint[]>();
  for (const expense of expenses) {
    const key = expense.categoryId ?? "uncategorized";
    const list = byCategory.get(key) ?? [];
    list.push(expense);
    byCategory.set(key, list);
  }

  const anomalies: Anomaly[] = [];

  for (const group of byCategory.values()) {
    if (group.length < minSamples) continue;

    const amounts = group.map((e) => e.amount);
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const variance =
      amounts.reduce((acc, value) => acc + (value - mean) ** 2, 0) / amounts.length;
    const stdDev = Math.sqrt(variance);
    if (stdDev === 0) continue;

    for (const expense of group) {
      const deviations = (expense.amount - mean) / stdDev;
      if (deviations >= threshold) {
        anomalies.push({
          expenseId: expense.id,
          amount: expense.amount,
          categoryName: expense.categoryName ?? "Sin categoría",
          deviations: Math.round(deviations * 10) / 10,
          categoryAverage: Math.round(mean * 100) / 100,
        });
      }
    }
  }

  return anomalies.sort((a, b) => b.deviations - a.deviations);
}

export interface SubscriptionCandidate {
  merchantId: string;
  merchantName: string;
  averageAmount: number;
  occurrences: number;
  /** Días medios entre cargos. ~30 sugiere mensual. */
  averageIntervalDays: number;
  lastChargeAt: string;
  /** Días desde el último cargo. Alto = candidata a cancelar. */
  daysSinceLastCharge: number;
  monthlyEstimate: number;
}

/**
 * Detecta suscripciones: mismo comercio, importe estable, intervalo regular.
 *
 * Es lo que hace posible responder "¿qué suscripciones casi no uso?" — el
 * sistema no sabe si las usas, pero sí puede listarlas con su costo mensual
 * para que decidas.
 */
export function detectSubscriptions(
  expenses: ExpensePoint[],
  options: { minOccurrences?: number; amountTolerance?: number } = {},
): SubscriptionCandidate[] {
  const { minOccurrences = 3, amountTolerance = 0.15 } = options;

  const byMerchant = new Map<string, ExpensePoint[]>();
  for (const expense of expenses) {
    if (!expense.merchantId) continue;
    const list = byMerchant.get(expense.merchantId) ?? [];
    list.push(expense);
    byMerchant.set(expense.merchantId, list);
  }

  const candidates: SubscriptionCandidate[] = [];

  for (const [merchantId, group] of byMerchant) {
    if (group.length < minOccurrences) continue;

    const sorted = [...group].sort(
      (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
    );

    const amounts = sorted.map((e) => e.amount);
    const average = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    if (average <= 0) continue;

    // Importe estable: ninguna ocurrencia se desvía más de la tolerancia.
    const isStable = amounts.every((a) => Math.abs(a - average) / average <= amountTolerance);
    if (!isStable) continue;

    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const days =
        (new Date(sorted[i]!.occurredAt).getTime() -
          new Date(sorted[i - 1]!.occurredAt).getTime()) /
        86_400_000;
      intervals.push(days);
    }
    const averageInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

    // Intervalo regular entre semanal y anual, con poca dispersión.
    if (averageInterval < 6 || averageInterval > 400) continue;
    const intervalDeviation = Math.sqrt(
      intervals.reduce((acc, v) => acc + (v - averageInterval) ** 2, 0) / intervals.length,
    );
    if (intervalDeviation > averageInterval * 0.35) continue;

    const last = sorted[sorted.length - 1]!;
    const daysSince = Math.floor(
      (Date.now() - new Date(last.occurredAt).getTime()) / 86_400_000,
    );

    candidates.push({
      merchantId,
      merchantName: last.merchantName ?? "Comercio",
      averageAmount: Math.round(average * 100) / 100,
      occurrences: sorted.length,
      averageIntervalDays: Math.round(averageInterval),
      lastChargeAt: last.occurredAt,
      daysSinceLastCharge: daysSince,
      monthlyEstimate: Math.round((average * (30 / averageInterval)) * 100) / 100,
    });
  }

  return candidates.sort((a, b) => b.monthlyEstimate - a.monthlyEstimate);
}

export interface BudgetStatus {
  categoryId: string | null;
  categoryName: string;
  budget: number;
  spent: number;
  remaining: number;
  percentUsed: number;
  level: "healthy" | "warning" | "exceeded";
  /** Ritmo diario que queda disponible para no pasarse. */
  dailyAllowance: number | null;
}

export function budgetStatus(
  budget: number,
  spent: number,
  categoryId: string | null,
  categoryName: string,
  daysRemaining: number | null = null,
): BudgetStatus {
  const remaining = budget - spent;
  const percentUsed = budget > 0 ? (spent / budget) * 100 : 0;
  const level: BudgetStatus["level"] =
    percentUsed >= 100 ? "exceeded" : percentUsed >= 80 ? "warning" : "healthy";

  return {
    categoryId,
    categoryName,
    budget,
    spent: Math.round(spent * 100) / 100,
    remaining: Math.round(remaining * 100) / 100,
    percentUsed: Math.round(percentUsed * 10) / 10,
    level,
    dailyAllowance:
      daysRemaining && daysRemaining > 0 && remaining > 0
        ? Math.round((remaining / daysRemaining) * 100) / 100
        : null,
  };
}

/** Comercios con mayor gasto. Alimenta el bloque "principales comercios". */
export function topMerchants(expenses: ExpensePoint[], limit = 5): GroupTotal[] {
  return groupTotals(expenses, "merchant").slice(0, limit);
}

/** Media diaria del período. Base de la proyección de fin de mes. */
export function dailyAverage(total: number, days: number): number {
  if (days <= 0) return 0;
  return Math.round((total / days) * 100) / 100;
}

/** Proyección lineal a fin de período según el ritmo actual. */
export function projectPeriodTotal(
  spentSoFar: number,
  daysElapsed: number,
  daysInPeriod: number,
): number {
  if (daysElapsed <= 0) return 0;
  return Math.round((spentSoFar / daysElapsed) * daysInPeriod * 100) / 100;
}
