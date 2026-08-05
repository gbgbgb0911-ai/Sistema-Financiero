import { formatMoney, type CurrencyCode } from "@/core/money";
import { formatDate, formatRelative } from "@/core/dates";
import { DEFAULT_CURRENCY, DEFAULT_LOCALE, DEFAULT_TIMEZONE } from "./constants";

/**
 * Formateadores ligados a las preferencias del usuario.
 * Se crea uno por sesión y se pasa por props, en vez de leer configuración
 * global desde componentes sueltos.
 */
export interface FormatterContext {
  currency: CurrencyCode;
  locale: string;
  timezone: string;
}

export const defaultFormatterContext: FormatterContext = {
  currency: DEFAULT_CURRENCY,
  locale: DEFAULT_LOCALE,
  timezone: DEFAULT_TIMEZONE,
};

export function createFormatters(ctx: FormatterContext = defaultFormatterContext) {
  return {
    money: (amount: number, options?: { compact?: boolean; currency?: CurrencyCode }) =>
      formatMoney(amount, options?.currency ?? ctx.currency, ctx.locale, {
        compact: options?.compact,
      }),

    date: (value: Date | string, style?: "short" | "medium" | "long" | "time" | "datetime") =>
      formatDate(value, ctx.timezone, ctx.locale, style),

    relative: (value: Date | string) => formatRelative(value, ctx.locale),

    number: (value: number, decimals = 0) =>
      new Intl.NumberFormat(ctx.locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(value),
  };
}

export type Formatters = ReturnType<typeof createFormatters>;
