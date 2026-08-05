import type { CurrencyCode } from "@/types/database";

export const APP_NAME = "Finanzas";
export const APP_DESCRIPTION =
  "Asistente financiero personal con IA. Controla gastos, pagos y tarjetas desde la web y WhatsApp.";

export const DEFAULT_TIMEZONE = "America/Lima";
export const DEFAULT_LOCALE = "es-PE";
export const DEFAULT_CURRENCY: CurrencyCode = "PEN";

export const CURRENCIES: Array<{ code: CurrencyCode; label: string; symbol: string }> = [
  { code: "PEN", label: "Sol peruano", symbol: "S/" },
  { code: "USD", label: "Dólar estadounidense", symbol: "$" },
  { code: "EUR", label: "Euro", symbol: "€" },
];

export const TIMEZONES = [
  "America/Lima",
  "America/Bogota",
  "America/Mexico_City",
  "America/Santiago",
  "America/Buenos_Aires",
  "America/New_York",
  "Europe/Madrid",
] as const;

/** Paleta de los gráficos. Coincide con --chart-N en globals.css. */
export const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--chart-6))",
];

export const CARD_KIND_LABELS = {
  credit: "Tarjeta de crédito",
  debit: "Tarjeta de débito",
  cash: "Efectivo",
  bank_account: "Cuenta bancaria",
  wallet: "Billetera digital",
} as const;

export const EXPENSE_SOURCE_LABELS = {
  manual: "Manual",
  email: "Correo",
  whatsapp: "WhatsApp",
  import: "Importado",
  recurring: "Recurrente",
} as const;

export const OCCURRENCE_STATUS_LABELS = {
  pending: "Pendiente",
  paid: "Pagado",
  overdue: "Vencido",
  skipped: "Omitido",
  canceled: "Cancelado",
} as const;

/** Máximo de rondas de tools en el bucle agéntico. Evita bucles infinitos. */
export const MAX_TOOL_ROUNDS = 8;

/** Umbral de confianza por debajo del cual se pide confirmación al usuario. */
export const EMAIL_CONFIDENCE_THRESHOLD = 0.75;

/** Ventana para considerar duplicado un gasto con mismo comercio e importe. */
export const DUPLICATE_WINDOW_MINUTES = 90;
