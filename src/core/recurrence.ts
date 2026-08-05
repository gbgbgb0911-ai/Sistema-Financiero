/**
 * Expansión de reglas de recurrencia a ocurrencias concretas.
 *
 * Se separa la *regla* (el pago recurrente) de la *instancia* (el vencimiento
 * de un mes concreto). Sin esa separación no se puede marcar pagado marzo sin
 * afectar a abril, ni posponer un vencimiento individual.
 */

import { addDays, addMonths, daysInMonth } from "./dates";

export type Frequency = "once" | "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";

export interface RecurrenceRule {
  frequency: Frequency;
  /** Fecha del primer vencimiento (ISO `YYYY-MM-DD`). */
  anchorDate: string;
  endDate?: string | null;
}

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  once: "Único",
  weekly: "Semanal",
  biweekly: "Quincenal",
  monthly: "Mensual",
  quarterly: "Trimestral",
  yearly: "Anual",
};

function parseISODate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
}

function formatISODate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Genera las fechas de vencimiento entre `from` y `until` (ambas ISO).
 *
 * Para frecuencias mensuales conserva el "día del mes" original: un pago
 * anclado al 31 vence el 28/29 en febrero y vuelve al 31 en marzo. Avanzar
 * sumando días haría que la fecha se fuera desplazando mes a mes.
 */
export function expandOccurrences(
  rule: RecurrenceRule,
  until: string,
  from?: string,
): string[] {
  const anchor = parseISODate(rule.anchorDate);
  const limit = parseISODate(until);
  const lowerBound = from ? parseISODate(from) : anchor;
  const end = rule.endDate ? parseISODate(rule.endDate) : null;

  if (rule.frequency === "once") {
    const withinRange = anchor <= limit && anchor >= lowerBound;
    return withinRange ? [formatISODate(anchor)] : [];
  }

  const dates: string[] = [];
  const anchorDayOfMonth = anchor.getUTCDate();
  let cursor = new Date(anchor.getTime());
  let iterations = 0;
  const MAX_ITERATIONS = 1000; // Protección frente a reglas mal formadas

  while (cursor <= limit && iterations++ < MAX_ITERATIONS) {
    if (end && cursor > end) break;
    if (cursor >= lowerBound) dates.push(formatISODate(cursor));

    switch (rule.frequency) {
      case "weekly":
        cursor = addDays(cursor, 7);
        break;
      case "biweekly":
        cursor = addDays(cursor, 14);
        break;
      case "monthly":
        cursor = nextMonthlyDate(cursor, anchorDayOfMonth, 1);
        break;
      case "quarterly":
        cursor = nextMonthlyDate(cursor, anchorDayOfMonth, 3);
        break;
      case "yearly":
        cursor = nextMonthlyDate(cursor, anchorDayOfMonth, 12);
        break;
    }
  }

  return dates;
}

/** Avanza N meses conservando el día de anclaje, ajustado al último día del mes. */
function nextMonthlyDate(current: Date, anchorDay: number, monthsAhead: number): Date {
  const advanced = addMonths(current, monthsAhead);
  const maxDay = daysInMonth(advanced.getUTCFullYear(), advanced.getUTCMonth());
  return new Date(
    Date.UTC(advanced.getUTCFullYear(), advanced.getUTCMonth(), Math.min(anchorDay, maxDay)),
  );
}

/** Siguiente vencimiento a partir de una fecha (ISO), o `null` si la regla terminó. */
export function nextOccurrence(rule: RecurrenceRule, after: string): string | null {
  const horizon = formatISODate(addMonths(parseISODate(after), 15));
  const upcoming = expandOccurrences(rule, horizon, after).filter((d) => d > after);
  return upcoming[0] ?? null;
}

/**
 * Fechas y tipos de recordatorio para una ocurrencia.
 * `reminderDays` viene del pago: `[1, 0]` = un día antes y el mismo día.
 */
export function reminderSchedule(
  dueDate: string,
  reminderDays: number[],
  hourLocal: number,
): Array<{ kind: "day_before" | "due_day" | "overdue"; date: string; hour: number }> {
  const due = parseISODate(dueDate);
  const schedule: Array<{ kind: "day_before" | "due_day" | "overdue"; date: string; hour: number }> = [];

  for (const daysAhead of reminderDays) {
    const target = addDays(due, -daysAhead);
    schedule.push({
      kind: daysAhead === 0 ? "due_day" : "day_before",
      date: formatISODate(target),
      hour: hourLocal,
    });
  }

  // Si no se registra el pago, se vuelve a recordar al día siguiente del vencimiento.
  schedule.push({
    kind: "overdue",
    date: formatISODate(addDays(due, 1)),
    hour: hourLocal,
  });

  return schedule;
}

/** Descripción legible de la recurrencia, para la interfaz. */
export function describeRecurrence(rule: RecurrenceRule, locale = "es-PE"): string {
  const anchor = parseISODate(rule.anchorDate);
  const dayOfMonth = anchor.getUTCDate();
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(anchor);

  switch (rule.frequency) {
    case "once":
      return `Una vez el ${new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(anchor)}`;
    case "weekly":
      return `Cada ${weekday}`;
    case "biweekly":
      return `Cada dos semanas, los ${weekday}`;
    case "monthly":
      return `Cada mes el día ${dayOfMonth}`;
    case "quarterly":
      return `Cada tres meses el día ${dayOfMonth}`;
    case "yearly":
      return `Cada año el ${new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "long",
        timeZone: "UTC",
      }).format(anchor)}`;
  }
}
