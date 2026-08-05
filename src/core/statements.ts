/**
 * Ciclos de facturación de tarjetas de crédito.
 *
 * "¿Cuánto debo en mi tarjeta?" no se responde con la suma histórica de todos
 * los consumos: se responde con el saldo del ciclo de facturación en curso.
 * Este módulo calcula esos ciclos a partir del día de corte y el de vencimiento.
 */

import { addMonths, daysInMonth } from "./dates";

export interface StatementCycle {
  /** Inicio del ciclo (día siguiente al corte anterior). */
  start: Date;
  /** Fin del ciclo = día de corte. */
  end: Date;
  /** Fecha límite de pago. */
  dueDate: Date;
  /** Días restantes hasta el vencimiento. Negativo si ya venció. */
  daysUntilDue: number;
  /** `true` si el ciclo aún admite consumos. */
  isCurrent: boolean;
}

/** Construye una fecha ajustando el día al último válido del mes. */
function dateWithClampedDay(year: number, monthIndex: number, day: number): Date {
  const maxDay = daysInMonth(year, monthIndex);
  return new Date(Date.UTC(year, monthIndex, Math.min(day, maxDay), 0, 0, 0, 0));
}

/**
 * Calcula el ciclo de facturación vigente en `reference`.
 *
 * `statementDay` es el día de corte; `dueDay` el de vencimiento. Cuando el día
 * de vencimiento es menor que el de corte, el pago cae en el mes siguiente
 * (ej: corte el 25, vence el 12 → vence el 12 del mes siguiente).
 */
export function currentStatementCycle(
  statementDay: number,
  dueDay: number,
  reference: Date = new Date(),
): StatementCycle {
  const year = reference.getUTCFullYear();
  const month = reference.getUTCMonth();
  const day = reference.getUTCDate();

  // Si aún no se llegó al corte de este mes, el ciclo vigente cerró el mes pasado.
  const cycleEndMonthOffset = day > statementDay ? 1 : 0;
  const end = dateWithClampedDay(year, month + cycleEndMonthOffset, statementDay);
  const previousEnd = addMonths(end, -1);
  const start = new Date(previousEnd.getTime() + 86_400_000);

  const dueMonthOffset = dueDay <= statementDay ? 1 : 0;
  const dueDate = dateWithClampedDay(
    end.getUTCFullYear(),
    end.getUTCMonth() + dueMonthOffset,
    dueDay,
  );

  const daysUntilDue = Math.ceil((dueDate.getTime() - reference.getTime()) / 86_400_000);

  return {
    start,
    end,
    dueDate,
    daysUntilDue,
    isCurrent: reference <= end,
  };
}

/** Ciclo anterior al vigente. Su saldo es el que normalmente hay que pagar. */
export function previousStatementCycle(
  statementDay: number,
  dueDay: number,
  reference: Date = new Date(),
): StatementCycle {
  const current = currentStatementCycle(statementDay, dueDay, reference);
  const referenceInPrevious = new Date(current.start.getTime() - 86_400_000);
  return currentStatementCycle(statementDay, dueDay, referenceInPrevious);
}

export interface CardUtilization {
  used: number;
  limit: number | null;
  /** Porcentaje de uso, 0–100. `null` si la tarjeta no tiene límite. */
  percent: number | null;
  level: "healthy" | "moderate" | "high" | "critical";
}

/**
 * Nivel de utilización de la línea de crédito.
 *
 * Los umbrales siguen la recomendación habitual de scoring crediticio: por
 * debajo del 30% se considera saludable, por encima del 90% es crítico.
 */
export function cardUtilization(used: number, limit: number | null): CardUtilization {
  if (!limit || limit <= 0) {
    return { used, limit: null, percent: null, level: "healthy" };
  }
  const percent = (used / limit) * 100;
  const level: CardUtilization["level"] =
    percent >= 90 ? "critical" : percent >= 70 ? "high" : percent >= 30 ? "moderate" : "healthy";
  return { used, limit, percent, level };
}

export const UTILIZATION_LABELS: Record<CardUtilization["level"], string> = {
  healthy: "Saludable",
  moderate: "Moderado",
  high: "Alto",
  critical: "Crítico",
};

/** Pago mínimo estimado. Aproximación: el mayor entre el 5% y un piso fijo. */
export function estimateMinimumPayment(balance: number, floor = 20): number {
  if (balance <= 0) return 0;
  return Math.max(Math.round(balance * 0.05 * 100) / 100, Math.min(floor, balance));
}
