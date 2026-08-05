import { z } from "zod";

export const cardInputSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(80),
  kind: z.enum(["credit", "debit", "cash", "bank_account", "wallet"]).default("credit"),
  issuer: z.string().trim().max(60).optional(),
  /** Solo los 4 últimos dígitos. El número completo nunca se almacena. */
  last4: z
    .string()
    .regex(/^\d{4}$/, "Deben ser 4 dígitos")
    .optional()
    .nullable(),
  currency: z.enum(["PEN", "USD", "EUR"]).default("PEN"),
  creditLimit: z.number().positive().max(99_999_999).optional().nullable(),
  statementDay: z.number().int().min(1).max(31).optional().nullable(),
  dueDay: z.number().int().min(1).max(31).optional().nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#0f172a"),
  isDefault: z.boolean().default(false),
});

export type CardInput = z.output<typeof cardInputSchema>;
export type CardFormValues = z.input<typeof cardInputSchema>;

export const cardUpdateSchema = cardInputSchema.partial().extend({
  id: z.string().uuid(),
});

export type CardUpdate = z.infer<typeof cardUpdateSchema>;
