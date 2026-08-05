import { z } from "zod";

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(60),
  kind: z.enum(["expense", "income"]).default("expense"),
  icon: z.string().trim().max(40).default("circle"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#64748b"),
  parentId: z.string().uuid().optional().nullable(),
});

export type CategoryInput = z.infer<typeof categoryInputSchema>;

export const categoryUpdateSchema = categoryInputSchema.partial().extend({
  id: z.string().uuid(),
});

export type CategoryUpdate = z.infer<typeof categoryUpdateSchema>;

export const budgetInputSchema = z.object({
  categoryId: z.string().uuid().optional().nullable(),
  period: z.enum(["weekly", "monthly"]).default("monthly"),
  amount: z.number().positive("El presupuesto debe ser mayor que cero").max(99_999_999),
  currency: z.enum(["PEN", "USD", "EUR"]).default("PEN"),
});

export type BudgetInput = z.output<typeof budgetInputSchema>;
export type BudgetFormValues = z.input<typeof budgetInputSchema>;
