import { z } from "zod";

/**
 * Validación de variables de entorno.
 *
 * Solo Supabase es obligatorio. El resto de integraciones son opcionales a
 * propósito: el proyecto tiene que arrancar y ser navegable sin cinco cuentas
 * de API. Cada integración se activa cuando aparece su variable y se degrada
 * de forma explícita cuando falta, en lugar de fallar en tiempo de ejecución.
 */

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),

  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-opus-5"),

  WHATSAPP_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  CRON_SECRET: z.string().optional(),
  N8N_WEBHOOK_SECRET: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

export function getEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverSchema.safeParse(process.env);

  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(
      `Faltan variables de entorno o son inválidas: ${missing}. ` +
        `Copia .env.example a .env.local y complétalas.`,
    );
  }

  cached = parsed.data;
  return cached;
}

/** Qué integraciones están disponibles. La UI lo usa para no ofrecer lo que no funciona. */
export function getFeatureFlags() {
  const env = process.env;
  return {
    ai: Boolean(env.ANTHROPIC_API_KEY),
    whatsapp: Boolean(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID),
    gmail: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    cron: Boolean(env.CRON_SECRET),
    serviceRole: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
  } as const;
}

export type FeatureFlags = ReturnType<typeof getFeatureFlags>;
