import { z } from "zod";

/**
 * Esquemas de gastos.
 *
 * Un único esquema por concepto, reutilizado en el formulario (react-hook-form),
 * la Server Action, la ruta de API y las tools de la IA. Así una regla de
 * validación se escribe una vez y no puede divergir entre superficies.
 */

const currencySchema = z.enum(["PEN", "USD", "EUR"]);

export const expenseInputSchema = z.object({
  amount: z
    .number({ message: "El monto es obligatorio" })
    .positive("El monto debe ser mayor que cero")
    .max(99_999_999, "El monto excede el límite permitido"),

  currency: currencySchema.default("PEN"),

  /** Comercio como texto libre. Se resuelve o crea en el servicio. */
  merchantName: z.string().trim().max(120).optional(),
  merchantId: z.string().uuid().optional().nullable(),

  categoryId: z.string().uuid().optional().nullable(),
  cardId: z.string().uuid().optional().nullable(),

  /** ISO 8601. Por defecto, el instante actual. */
  occurredAt: z.string().datetime({ offset: true }).optional(),

  description: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(1000).optional(),

  fxRate: z.number().positive().max(10_000).default(1),
});

/** Salida: lo que recibe el servicio, con los valores por defecto ya aplicados. */
export type ExpenseInput = z.output<typeof expenseInputSchema>;
/** Entrada: lo que maneja el formulario, donde los campos con default son opcionales. */
export type ExpenseFormValues = z.input<typeof expenseInputSchema>;

export const expenseUpdateSchema = expenseInputSchema.partial().extend({
  id: z.string().uuid(),
  status: z.enum(["confirmed", "pending_review", "possible_duplicate", "voided"]).optional(),
});

export type ExpenseUpdate = z.infer<typeof expenseUpdateSchema>;

/** Filtros del historial. También los usa la tool `list_expenses` de la IA. */
export const expenseFiltersSchema = z.object({
  search: z.string().trim().max(120).optional(),
  categoryIds: z.array(z.string().uuid()).optional(),
  cardIds: z.array(z.string().uuid()).optional(),
  merchantIds: z.array(z.string().uuid()).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  minAmount: z.number().nonnegative().optional(),
  maxAmount: z.number().nonnegative().optional(),
  sources: z.array(z.enum(["manual", "email", "whatsapp", "import", "recurring"])).optional(),
  statuses: z
    .array(z.enum(["confirmed", "pending_review", "possible_duplicate", "voided"]))
    .optional(),
  /** Paginación por cursor: más estable que OFFSET cuando llegan gastos nuevos. */
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(50),
  sortBy: z.enum(["date", "amount"]).default("date"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export type ExpenseFilters = z.infer<typeof expenseFiltersSchema>;

/**
 * Esquema para la extracción automática desde correos.
 * Se usa como `output_config.format` en la llamada al modelo, lo que garantiza
 * JSON válido sin necesidad de parsear texto libre.
 */
export const extractedExpenseSchema = z.object({
  amount: z.number().positive().nullable(),
  currency: currencySchema.nullable(),
  merchant: z.string().max(120).nullable(),
  cardLast4: z.string().regex(/^\d{4}$/).nullable(),
  occurredAt: z.string().nullable(),
  transactionType: z.enum(["purchase", "withdrawal", "transfer", "payment", "refund", "unknown"]),
  confidence: z.number().min(0).max(1),
});

export type ExtractedExpense = z.infer<typeof extractedExpenseSchema>;
