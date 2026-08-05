import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  resolvePeriod,
  eachDayInRange,
  daysBetween,
  type PeriodKey,
} from "@/core/dates";
import {
  groupTotals,
  dailySeries,
  comparePeriods,
  categoryTrends,
  detectAnomalies,
  detectSubscriptions,
  topMerchants,
  projectPeriodTotal,
  type ExpensePoint,
  type GroupTotal,
  type DailySeriesPoint,
  type PeriodComparison,
  type CategoryTrend,
  type Anomaly,
  type SubscriptionCandidate,
} from "@/core/analytics";
import type { BudgetStatus } from "@/core/analytics";
import { findExpensesInRange, type ExpenseWithRelations } from "@/modules/expenses/repository";
import { sumPendingOccurrences, findUpcomingOccurrences } from "@/modules/payments/repository";
import { getBudgetStatuses } from "@/modules/categories/service";
import { addDays } from "@/core/dates";

type Client = SupabaseClient<Database>;

/** Adapta una fila con relaciones al tipo puro que consume `core/analytics`. */
export function toExpensePoint(expense: ExpenseWithRelations): ExpensePoint {
  return {
    id: expense.id,
    amount: Number(expense.amount_base ?? expense.amount),
    occurredAt: expense.occurred_at,
    categoryId: expense.category_id,
    categoryName: expense.category?.name ?? null,
    merchantId: expense.merchant_id,
    merchantName: expense.merchant?.name ?? null,
    cardId: expense.card_id,
    cardName: expense.card?.name ?? null,
  };
}

export interface DashboardData {
  period: PeriodKey;
  today: PeriodComparison;
  periodTotal: PeriodComparison;
  upcomingTotal: number;
  upcomingCount: number;
  overdueCount: number;
  projectedTotal: number;
  dailyAverage: number;
  byCategory: GroupTotal[];
  byCard: GroupTotal[];
  series: DailySeriesPoint[];
  trends: CategoryTrend[];
  budgets: BudgetStatus[];
  topMerchants: GroupTotal[];
  anomalies: Anomaly[];
  recentExpenses: ExpenseWithRelations[];
  upcomingPayments: Awaited<ReturnType<typeof findUpcomingOccurrences>>;
  expenseCount: number;
}

/**
 * Reúne todo lo que necesita el dashboard en una sola pasada.
 *
 * Se traen los gastos del período una vez y todos los agregados se calculan en
 * memoria con funciones puras. Es más rápido que lanzar seis consultas de
 * agregación distintas, y hace los cálculos testeables sin base de datos.
 */
export async function getDashboardData(
  client: Client,
  userId: string,
  timezone: string,
  period: PeriodKey = "month",
): Promise<DashboardData> {
  const now = new Date();
  const { current, previous } = resolvePeriod(period, timezone, now);
  const todayRange = resolvePeriod("today", timezone, now);

  const [
    currentExpenses,
    previousExpenses,
    todayExpenses,
    todayPreviousExpenses,
    upcoming,
    overdue,
    budgets,
  ] = await Promise.all([
    findExpensesInRange(client, userId, current.from.toISOString(), current.to.toISOString()),
    findExpensesInRange(client, userId, previous.from.toISOString(), previous.to.toISOString()),
    findExpensesInRange(
      client,
      userId,
      todayRange.current.from.toISOString(),
      todayRange.current.to.toISOString(),
    ),
    findExpensesInRange(
      client,
      userId,
      todayRange.previous.from.toISOString(),
      todayRange.previous.to.toISOString(),
    ),
    sumPendingOccurrences(
      client,
      userId,
      now.toISOString().slice(0, 10),
      addDays(now, 30).toISOString().slice(0, 10),
    ),
    findUpcomingOccurrences(client, userId, {
      to: now.toISOString().slice(0, 10),
      statuses: ["pending", "overdue"],
    }),
    getBudgetStatuses(client, userId, timezone),
  ]);

  const upcomingPayments = await findUpcomingOccurrences(client, userId, {
    from: now.toISOString().slice(0, 10),
    to: addDays(now, 45).toISOString().slice(0, 10),
    limit: 8,
  });

  const currentPoints = currentExpenses.map(toExpensePoint);
  const previousPoints = previousExpenses.map(toExpensePoint);

  const sum = (points: ExpensePoint[]) =>
    Math.round(points.reduce((total, p) => total + p.amount, 0) * 100) / 100;

  const currentTotal = sum(currentPoints);
  const daysElapsed = Math.max(1, daysBetween(current.from, now));
  const daysInPeriod = Math.max(1, daysBetween(current.from, current.to));

  return {
    period,
    today: comparePeriods(sum(todayExpenses.map(toExpensePoint)), sum(todayPreviousExpenses.map(toExpensePoint))),
    periodTotal: comparePeriods(currentTotal, sum(previousPoints)),
    upcomingTotal: upcoming.total,
    upcomingCount: upcoming.count,
    overdueCount: overdue.length,
    projectedTotal: projectPeriodTotal(currentTotal, daysElapsed, daysInPeriod),
    dailyAverage: Math.round((currentTotal / daysElapsed) * 100) / 100,
    byCategory: groupTotals(currentPoints, "category"),
    byCard: groupTotals(currentPoints, "card"),
    series: dailySeries(currentPoints, eachDayInRange(current, timezone), timezone),
    trends: categoryTrends(currentPoints, previousPoints).slice(0, 6),
    budgets,
    topMerchants: topMerchants(currentPoints, 5),
    anomalies: detectAnomalies(currentPoints).slice(0, 3),
    recentExpenses: currentExpenses.slice(0, 8),
    upcomingPayments,
    expenseCount: currentPoints.length,
  };
}

/**
 * Suscripciones detectadas en los últimos 6 meses.
 *
 * Se usa una ventana larga a propósito: con menos de 3 meses no hay señal
 * suficiente para distinguir una suscripción de una coincidencia.
 */
export async function getSubscriptions(
  client: Client,
  userId: string,
): Promise<SubscriptionCandidate[]> {
  const to = new Date();
  const from = new Date(to.getTime() - 190 * 86_400_000);

  const expenses = await findExpensesInRange(
    client,
    userId,
    from.toISOString(),
    to.toISOString(),
  );

  return detectSubscriptions(expenses.map(toExpensePoint));
}
