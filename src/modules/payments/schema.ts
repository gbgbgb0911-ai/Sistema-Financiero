import { z } from "zod";

const currencySchema = z.enum(["PEN", "USD", "EUR"]);

export const paymentInputSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(120),
  amount: z.number().positive("El monto debe ser mayor que cero").max(99_999_999),
  currency: currencySchema.default("PEN"),
  categoryId: z.string().uuid().optional().nullable(),
  cardId: z.string().uuid().optional().nullable(),
  frequency: z.enum(["once", "weekly", "biweekly", "monthly", "quarterly", "yearly"]),
  /** Fecha del primer vencimiento (`YYYY-MM-DD`). */
  anchorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  /** Días de antelación de los recordatorios. `[1, 0]` = un día antes y el mismo día. */
  reminderDays: z.array(z.number().int().min(0).max(30)).max(5).default([1, 0]),
  autoCreateExpense: z.boolean().default(true),
  notes: z.string().trim().max(1000).optional(),
});

export type PaymentInput = z.output<typeof paymentInputSchema>;
export type PaymentFormValues = z.input<typeof paymentInputSchema>;

export const paymentUpdateSchema = paymentInputSchema.partial().extend({
  id: z.string().uuid(),
  isActive: z.boolean().optional(),
});

export type PaymentUpdate = z.infer<typeof paymentUpdateSchema>;

/** Acciones que el usuario puede ejecutar sobre una ocurrencia, también desde WhatsApp. */
export const occurrenceActionSchema = z.object({
  occurrenceId: z.string().uuid(),
  action: z.enum(["pay", "snooze", "postpone", "skip", "reopen"]),
  /** Para `snooze`: horas. Para `postpone`: días. */
  value: z.number().int().min(1).max(90).optional(),
});

export type OccurrenceAction = z.infer<typeof occurrenceActionSchema>;
