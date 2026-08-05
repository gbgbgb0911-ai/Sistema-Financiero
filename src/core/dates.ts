/**
 * Fechas y rangos temporales.
 *
 * Todo lo que aquí se calcula depende de la zona horaria del usuario, no de la
 * del servidor. "¿Cuánto gasté hoy?" a las 23:00 en Lima significa algo distinto
 * que a las 04:00 UTC del día siguiente, y el sistema debe responder lo que el
 * usuario espera.
 */

export type PeriodKey = "today" | "yesterday" | "week" | "month" | "quarter" | "year" | "custom";

export interface DateRange {
  from: Date;
  to: Date;
}

export interface ComparedRange {
  current: DateRange;
  previous: DateRange;
}

const DAY_MS = 86_400_000;

/**
 * Devuelve la fecha "de pared" en la zona del usuario, expresada como un Date
 * en UTC cuyos componentes coinciden con la hora local. Se usa solo para
 * derivar día/mes/año; no debe persistirse.
 */
export function zonedNow(timezone: string, reference: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(reference);

  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");

  return new Date(
    Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour") % 24,
      get("minute"),
      get("second"),
    ),
  );
}

/** Desplazamiento de la zona respecto a UTC, en milisegundos, en un instante dado. */
export function timezoneOffsetMs(timezone: string, reference: Date = new Date()): number {
  return zonedNow(timezone, reference).getTime() - truncateMs(reference).getTime();
}

function truncateMs(date: Date): Date {
  return new Date(Math.floor(date.getTime() / 1000) * 1000);
}

/** Convierte una fecha de pared local (en la zona dada) al instante UTC real. */
export function zonedToUtc(local: Date, timezone: string): Date {
  // Se itera una vez porque el offset puede cambiar (horario de verano) entre
  // la estimación inicial y el instante resultante.
  const firstGuess = new Date(local.getTime() - timezoneOffsetMs(timezone, local));
  const correction = timezoneOffsetMs(timezone, firstGuess);
  return new Date(local.getTime() - correction);
}

/** Inicio del día (00:00:00 local) como instante UTC. */
export function startOfDayInZone(date: Date, timezone: string): Date {
  const zoned = zonedNow(timezone, date);
  const local = new Date(
    Date.UTC(zoned.getUTCFullYear(), zoned.getUTCMonth(), zoned.getUTCDate(), 0, 0, 0, 0),
  );
  return zonedToUtc(local, timezone);
}

export function endOfDayInZone(date: Date, timezone: string): Date {
  return new Date(startOfDayInZone(date, timezone).getTime() + DAY_MS);
}

/** Inicio de la semana. Lunes, que es la convención en español. */
export function startOfWeekInZone(date: Date, timezone: string): Date {
  const zoned = zonedNow(timezone, date);
  const dayOfWeek = zoned.getUTCDay();
  const daysFromMonday = (dayOfWeek + 6) % 7;
  const monday = new Date(zoned.getTime() - daysFromMonday * DAY_MS);
  return startOfDayInZone(zonedToUtc(monday, timezone), timezone);
}

export function startOfMonthInZone(date: Date, timezone: string): Date {
  const zoned = zonedNow(timezone, date);
  const local = new Date(Date.UTC(zoned.getUTCFullYear(), zoned.getUTCMonth(), 1, 0, 0, 0, 0));
  return zonedToUtc(local, timezone);
}

export function startOfYearInZone(date: Date, timezone: string): Date {
  const zoned = zonedNow(timezone, date);
  const local = new Date(Date.UTC(zoned.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
  return zonedToUtc(local, timezone);
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const targetMonth = result.getUTCMonth() + months;
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(targetMonth);
  // Preserva el "último día del mes": 31 de enero + 1 mes = 28/29 de febrero,
  // no el 2 o 3 de marzo.
  const lastDay = daysInMonth(result.getUTCFullYear(), result.getUTCMonth());
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

/**
 * Resuelve un período nombrado a un rango concreto, junto con el rango
 * equivalente del período anterior para poder comparar.
 *
 * La comparación es lo que convierte un número en información: "S/ 2,340" no
 * dice nada; "S/ 2,340, un 5% menos que el mes pasado" sí.
 */
export function resolvePeriod(
  period: PeriodKey,
  timezone: string,
  reference: Date = new Date(),
  custom?: DateRange,
): ComparedRange {
  switch (period) {
    case "today": {
      const from = startOfDayInZone(reference, timezone);
      const to = endOfDayInZone(reference, timezone);
      return {
        current: { from, to },
        previous: { from: addDays(from, -1), to: from },
      };
    }
    case "yesterday": {
      const todayStart = startOfDayInZone(reference, timezone);
      const from = addDays(todayStart, -1);
      return {
        current: { from, to: todayStart },
        previous: { from: addDays(from, -1), to: from },
      };
    }
    case "week": {
      const from = startOfWeekInZone(reference, timezone);
      const to = addDays(from, 7);
      return {
        current: { from, to },
        previous: { from: addDays(from, -7), to: from },
      };
    }
    case "month": {
      const from = startOfMonthInZone(reference, timezone);
      const to = addMonths(from, 1);
      return {
        current: { from, to },
        previous: { from: addMonths(from, -1), to: from },
      };
    }
    case "quarter": {
      const monthStart = startOfMonthInZone(reference, timezone);
      const quarterIndex = Math.floor(monthStart.getUTCMonth() / 3);
      const from = addMonths(monthStart, quarterIndex * 3 - monthStart.getUTCMonth());
      const to = addMonths(from, 3);
      return {
        current: { from, to },
        previous: { from: addMonths(from, -3), to: from },
      };
    }
    case "year": {
      const from = startOfYearInZone(reference, timezone);
      const to = addMonths(from, 12);
      return {
        current: { from, to },
        previous: { from: addMonths(from, -12), to: from },
      };
    }
    case "custom": {
      if (!custom) throw new Error("El período 'custom' requiere un rango explícito");
      const span = custom.to.getTime() - custom.from.getTime();
      return {
        current: custom,
        previous: {
          from: new Date(custom.from.getTime() - span),
          to: custom.from,
        },
      };
    }
  }
}

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: "Hoy",
  yesterday: "Ayer",
  week: "Esta semana",
  month: "Este mes",
  quarter: "Este trimestre",
  year: "Este año",
  custom: "Personalizado",
};

export function formatDate(
  date: Date | string,
  timezone: string,
  locale = "es-PE",
  style: "short" | "medium" | "long" | "time" | "datetime" = "medium",
): string {
  const value = typeof date === "string" ? new Date(date) : date;
  const styles: Record<typeof style, Intl.DateTimeFormatOptions> = {
    short: { day: "2-digit", month: "2-digit" },
    medium: { day: "numeric", month: "short", year: "numeric" },
    long: { day: "numeric", month: "long", year: "numeric" },
    time: { hour: "numeric", minute: "2-digit" },
    datetime: { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" },
  };

  return new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    ...styles[style],
  }).format(value);
}

/** "hace 3 días", "en 2 semanas". Más legible que una fecha absoluta en listas. */
export function formatRelative(date: Date | string, locale = "es-PE"): string {
  const value = typeof date === "string" ? new Date(date) : date;
  const diffMs = value.getTime() - Date.now();
  const diffDays = Math.round(diffMs / DAY_MS);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (Math.abs(diffDays) < 1) {
    const diffHours = Math.round(diffMs / 3_600_000);
    if (Math.abs(diffHours) < 1) {
      return rtf.format(Math.round(diffMs / 60_000), "minute");
    }
    return rtf.format(diffHours, "hour");
  }
  if (Math.abs(diffDays) < 7) return rtf.format(diffDays, "day");
  if (Math.abs(diffDays) < 30) return rtf.format(Math.round(diffDays / 7), "week");
  return rtf.format(Math.round(diffDays / 30), "month");
}

/** Fecha en formato ISO `YYYY-MM-DD` según la zona del usuario. */
export function toISODate(date: Date, timezone = "UTC"): string {
  const zoned = zonedNow(timezone, date);
  const year = zoned.getUTCFullYear();
  const month = String(zoned.getUTCMonth() + 1).padStart(2, "0");
  const day = String(zoned.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Serie de días de un rango. Base del gráfico de flujo de caja. */
export function eachDayInRange(range: DateRange, timezone: string): string[] {
  const days: string[] = [];
  let cursor = startOfDayInZone(range.from, timezone);
  const limit = range.to.getTime();
  let guard = 0;
  while (cursor.getTime() < limit && guard++ < 400) {
    days.push(toISODate(cursor, timezone));
    cursor = addDays(cursor, 1);
  }
  return days;
}
