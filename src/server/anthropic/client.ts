import Anthropic from "@anthropic-ai/sdk";
import { DomainError } from "@/core/errors";

/**
 * Cliente de Anthropic.
 *
 * Se crea de forma perezosa para que la aplicación arranque sin `ANTHROPIC_API_KEY`:
 * el resto del sistema (dashboard, gastos, pagos) funciona igual, y solo el
 * asistente informa de que no está configurado.
 */

let cached: Anthropic | null = null;

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function getAnthropic(): Anthropic {
  if (!isAiConfigured()) {
    throw DomainError.integrationUnavailable("Anthropic");
  }
  if (!cached) {
    cached = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return cached;
}

export function getModel(): string {
  return process.env.ANTHROPIC_MODEL ?? "claude-opus-5";
}

/**
 * Registra el consumo de tokens.
 *
 * Sin esta contabilidad no hay forma de detectar que un usuario o un flujo
 * concreto está disparando el costo hasta que llega la factura.
 */
export interface UsageRecord {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

export function extractUsage(usage: {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}): UsageRecord {
  return {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
  };
}

/** Precios por millón de tokens de `claude-opus-5`, para la estimación de costo. */
const PRICE_PER_MTOK = { input: 5, output: 25, cacheRead: 0.5 };

export function estimateCost(usage: UsageRecord): number {
  const cost =
    (usage.inputTokens / 1_000_000) * PRICE_PER_MTOK.input +
    (usage.outputTokens / 1_000_000) * PRICE_PER_MTOK.output +
    (usage.cacheReadTokens / 1_000_000) * PRICE_PER_MTOK.cacheRead;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
