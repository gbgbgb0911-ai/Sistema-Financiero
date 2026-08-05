/**
 * Aritmética monetaria.
 *
 * Regla del módulo: los cálculos intermedios se hacen en **céntimos enteros**.
 * Sumar floats acumula error de redondeo, y en un sistema financiero ese error
 * termina siendo visible para el usuario. Solo se vuelve a decimales al formatear.
 */

export type CurrencyCode = "PEN" | "USD" | "EUR";

export interface Money {
  /** Importe en céntimos (entero). 1234 = 12.34 */
  cents: number;
  currency: CurrencyCode;
}

const CURRENCY_SYMBOL: Record<CurrencyCode, string> = {
  PEN: "S/",
  USD: "$",
  EUR: "€",
};

/** Convierte un importe decimal a céntimos, redondeando al céntimo más cercano. */
export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/** Convierte céntimos a un importe decimal con dos decimales. */
export function toAmount(cents: number): number {
  return Math.round(cents) / 100;
}

export function money(amount: number, currency: CurrencyCode = "PEN"): Money {
  return { cents: toCents(amount), currency };
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { cents: a.cents + b.cents, currency: a.currency };
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { cents: a.cents - b.cents, currency: a.currency };
}

export function multiplyMoney(a: Money, factor: number): Money {
  return { cents: Math.round(a.cents * factor), currency: a.currency };
}

export function sumMoney(items: Money[], currency: CurrencyCode = "PEN"): Money {
  if (items.length === 0) return { cents: 0, currency };
  const target = items[0]!.currency;
  let total = 0;
  for (const item of items) {
    if (item.currency !== target) {
      throw new Error(
        `No se pueden sumar monedas distintas (${target} y ${item.currency}). ` +
          `Convierte a la moneda base antes de sumar.`,
      );
    }
    total += item.cents;
  }
  return { cents: total, currency: target };
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error(`Operación entre monedas distintas: ${a.currency} y ${b.currency}`);
  }
}

/**
 * Convierte a la moneda base aplicando un tipo de cambio.
 * `rate` expresa cuántas unidades de `to` vale una unidad de la moneda origen.
 */
export function convertMoney(amount: Money, to: CurrencyCode, rate: number): Money {
  if (amount.currency === to) return amount;
  return { cents: Math.round(amount.cents * rate), currency: to };
}

/**
 * Formatea para mostrar. Usa Intl para respetar la convención local
 * (separadores de miles y decimales varían por locale).
 */
export function formatMoney(
  amount: Money | number,
  currency: CurrencyCode = "PEN",
  locale = "es-PE",
  options: { compact?: boolean; hideSymbol?: boolean } = {},
): string {
  const value = typeof amount === "number" ? amount : toAmount(amount.cents);
  const code = typeof amount === "number" ? currency : amount.currency;

  if (options.compact && Math.abs(value) >= 1000) {
    const compact = new Intl.NumberFormat(locale, {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
    return options.hideSymbol ? compact : `${CURRENCY_SYMBOL[code]} ${compact}`;
  }

  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

  return options.hideSymbol ? formatted : `${CURRENCY_SYMBOL[code]} ${formatted}`;
}

/**
 * Versión accesible del importe, para `aria-label`.
 * Un lector de pantalla leyendo "S/35.50" dice "ese barra treinta y cinco".
 */
export function formatMoneyForScreenReader(
  amount: number,
  currency: CurrencyCode = "PEN",
): string {
  const names: Record<CurrencyCode, [string, string]> = {
    PEN: ["sol", "soles"],
    USD: ["dólar", "dólares"],
    EUR: ["euro", "euros"],
  };
  const whole = Math.floor(Math.abs(amount));
  const cents = Math.round((Math.abs(amount) - whole) * 100);
  const [singular, plural] = names[currency];
  const unit = whole === 1 ? singular : plural;
  const sign = amount < 0 ? "menos " : "";
  return cents > 0
    ? `${sign}${whole} ${unit} con ${cents}`
    : `${sign}${whole} ${unit}`;
}

/** Variación porcentual entre dos períodos. `null` si no hay base de comparación. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function formatPercent(value: number | null, decimals = 1): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}%`;
}

export function currencySymbol(code: CurrencyCode): string {
  return CURRENCY_SYMBOL[code];
}

/**
 * Extrae un importe de texto libre ("S/ 1,234.56", "35 soles", "$12.30").
 * Lo usa tanto el parser de correos como el de mensajes de WhatsApp.
 */
export function parseAmountFromText(text: string): number | null {
  const cleaned = text.replace(/\s+/g, " ").trim();

  const patterns = [
    /(?:S\/|PEN|soles?)\s*([0-9][0-9.,]*)/i,
    /(?:US\$|USD|\$|d[oó]lares?)\s*([0-9][0-9.,]*)/i,
    /([0-9][0-9.,]*)\s*(?:soles?|PEN|d[oó]lares?|USD)/i,
    /([0-9][0-9.,]*)/,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (!match?.[1]) continue;
    const value = normalizeNumericString(match[1]);
    if (value !== null && value > 0) return value;
  }
  return null;
}

/**
 * Normaliza "1,234.56" y "1.234,56" al mismo número.
 * La ambigüedad se resuelve por la posición del último separador.
 */
export function normalizeNumericString(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/[0-9]/.test(trimmed)) return null;

  const lastComma = trimmed.lastIndexOf(",");
  const lastDot = trimmed.lastIndexOf(".");

  let normalized: string;

  if (lastComma >= 0 && lastDot >= 0) {
    // Están los dos separadores: el último es el decimal.
    // "1.234,56" (europeo) vs "1,234.56" (anglosajón).
    normalized =
      lastComma > lastDot
        ? trimmed.replace(/\./g, "").replace(",", ".")
        : trimmed.replace(/,/g, "");
  } else if (lastComma >= 0 || lastDot >= 0) {
    // Solo hay un separador y es ambiguo: "1.234" puede ser mil doscientos
    // treinta y cuatro (miles) o uno coma doscientos treinta y cuatro (decimal).
    //
    // Se resuelve por el número de dígitos que le siguen: los importes vienen
    // siempre con dos decimales, así que exactamente tres dígitos detrás
    // significa separador de miles.
    const separatorIndex = Math.max(lastComma, lastDot);
    const decimals = trimmed.length - separatorIndex - 1;
    normalized =
      decimals === 3
        ? trimmed.replace(/[.,]/g, "")
        : trimmed.replace(/,/g, ".");
  } else {
    normalized = trimmed;
  }

  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : null;
}

/** Detecta la moneda mencionada en un texto. */
export function detectCurrency(text: string): CurrencyCode | null {
  if (/US\$|USD|d[oó]lar/i.test(text)) return "USD";
  if (/€|EUR|euro/i.test(text)) return "EUR";
  if (/S\/|PEN|sol(es)?\b/i.test(text)) return "PEN";
  return null;
}
