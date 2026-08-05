import { z } from "zod";

export const profileUpdateSchema = z.object({
  fullName: z.string().trim().max(120).optional(),
  /** E.164 sin el "+". Es la clave que resuelve el usuario desde WhatsApp. */
  phoneE164: z
    .string()
    .trim()
    .regex(/^[1-9]\d{7,14}$/, "Formato inválido. Ejemplo: 51987654321")
    .optional()
    .nullable(),
  timezone: z.string().min(1).max(60).optional(),
  baseCurrency: z.enum(["PEN", "USD", "EUR"]).optional(),
  locale: z.string().min(2).max(10).optional(),
  whatsappOptIn: z.boolean().optional(),
  notificationPrefs: z
    .object({
      daily_report: z.boolean().optional(),
      weekly_report: z.boolean().optional(),
      monthly_report: z.boolean().optional(),
      report_hour: z.number().int().min(0).max(23).optional(),
      reminder_hour: z.number().int().min(0).max(23).optional(),
    })
    .optional(),
});

export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;
