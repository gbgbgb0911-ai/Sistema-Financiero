import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ProfileRow } from "@/types/database";
import { zonedNow, formatDate } from "@/core/dates";
import { isAiConfigured, getModel } from "@/server/anthropic/client";
import { runAssistant, type AgentTurn } from "@/server/anthropic/agent";
import type { ToolContext } from "@/server/anthropic/tools";
import { detectQuickIntent, HELP_MESSAGE } from "./intents";
import { applyOccurrenceAction } from "@/modules/payments/service";
import { findUpcomingOccurrences } from "@/modules/payments/repository";
import { DEFAULT_LOCALE } from "@/lib/constants";

type Client = SupabaseClient<Database>;

export interface HandleMessageResult {
  reply: string;
  /** `true` si se resolvió sin llamar al modelo. */
  handledLocally: boolean;
  toolsUsed?: string[];
}

/**
 * Procesa un mensaje entrante.
 *
 * Orden deliberado:
 *   1. Intención rápida sobre un recordatorio reciente (sin IA, instantáneo).
 *   2. Asistente con tools.
 *
 * La mayoría de mensajes reales son respuestas a recordatorios, así que
 * resolverlos primero ahorra la mayor parte del gasto en el modelo.
 */
export async function handleIncomingMessage(
  client: Client,
  profile: ProfileRow,
  text: string,
  channel: "whatsapp" | "web" = "whatsapp",
): Promise<HandleMessageResult> {
  const intent = detectQuickIntent(text);

  if (intent?.kind === "help") {
    return { reply: HELP_MESSAGE, handledLocally: true };
  }

  if (intent && ["pay", "snooze", "postpone", "skip"].includes(intent.kind)) {
    const resolved = await resolveAgainstPendingOccurrence(client, profile, intent);
    if (resolved) return { reply: resolved, handledLocally: true };
    // Si no hay vencimiento al que aplicarlo, se deja pasar a la IA: puede que
    // "listo" signifique otra cosa en el contexto de la conversación.
  }

  if (!isAiConfigured()) {
    return {
      reply:
        "El asistente de IA no está configurado todavía. Puedes seguir usando el " +
        "panel web para registrar y consultar tus gastos.",
      handledLocally: true,
    };
  }

  const history = await loadRecentHistory(client, profile.id, channel);

  const toolContext: ToolContext = {
    client,
    userId: profile.id,
    timezone: profile.timezone,
    currency: profile.base_currency,
    locale: profile.locale ?? DEFAULT_LOCALE,
  };

  const now = new Date();
  const result = await runAssistant(
    text,
    {
      userName: profile.full_name,
      timezone: profile.timezone,
      currency: profile.base_currency,
      locale: profile.locale ?? DEFAULT_LOCALE,
      todayLocal: formatDate(now, profile.timezone, profile.locale ?? DEFAULT_LOCALE, "datetime"),
      channel,
    },
    toolContext,
    {
      history,
      // Las consultas por WhatsApp suelen ser puntuales: no necesitan el nivel
      // de análisis del panel, y la latencia importa más.
      effort: channel === "whatsapp" ? "low" : "medium",
      maxTokens: channel === "whatsapp" ? 4_000 : 8_000,
    },
  );

  await Promise.all([
    persistTurn(client, profile.id, channel, "user", text),
    persistTurn(client, profile.id, channel, "assistant", result.text),
    recordUsage(client, profile.id, result),
  ]);

  return { reply: result.text, handledLocally: false, toolsUsed: result.toolsUsed };
}

/**
 * Aplica una intención rápida al vencimiento pendiente más próximo.
 *
 * Solo se considera el más cercano en el tiempo, que es al que casi con
 * seguridad se refiere la respuesta al último recordatorio.
 */
async function resolveAgainstPendingOccurrence(
  client: Client,
  profile: ProfileRow,
  intent: NonNullable<ReturnType<typeof detectQuickIntent>>,
): Promise<string | null> {
  const zonedToday = zonedNow(profile.timezone);
  const horizon = new Date(zonedToday.getTime() + 10 * 86_400_000).toISOString().slice(0, 10);

  const occurrences = await findUpcomingOccurrences(client, profile.id, {
    to: horizon,
    limit: 1,
    statuses: ["pending", "overdue"],
  });

  const occurrence = occurrences[0];
  if (!occurrence) return null;

  const action =
    intent.kind === "pay"
      ? { occurrenceId: occurrence.id, action: "pay" as const }
      : intent.kind === "snooze"
        ? { occurrenceId: occurrence.id, action: "snooze" as const, value: intent.hours }
        : intent.kind === "postpone"
          ? { occurrenceId: occurrence.id, action: "postpone" as const, value: intent.days }
          : { occurrenceId: occurrence.id, action: "skip" as const };

  const result = await applyOccurrenceAction(client, profile.id, action);
  return result.message;
}

/**
 * Historial reciente para dar contexto multi-turno.
 * Se limita a 10 mensajes: suficiente para que "y el mes pasado?" tenga
 * sentido, sin inflar el prompt en cada petición.
 */
async function loadRecentHistory(
  client: Client,
  userId: string,
  channel: "whatsapp" | "web",
): Promise<AgentTurn[]> {
  const { data } = await client
    .from("conversation_messages")
    .select("role, content, created_at, conversation_id, conversations!inner(channel)")
    .eq("user_id", userId)
    .eq("conversations.channel", channel)
    .order("created_at", { ascending: false })
    .limit(10);

  const rows = (data ?? []) as unknown as Array<{ role: "user" | "assistant"; content: string }>;
  return rows.reverse().map((row) => ({ role: row.role, content: row.content }));
}

async function persistTurn(
  client: Client,
  userId: string,
  channel: "whatsapp" | "web",
  role: "user" | "assistant",
  content: string,
): Promise<void> {
  const { data: existing } = await client
    .from("conversations")
    .select("id")
    .eq("user_id", userId)
    .eq("channel", channel)
    .order("last_message_at", { ascending: false })
    .limit(1);

  let conversationId = existing?.[0]?.id;

  if (!conversationId) {
    const { data: created } = await client
      .from("conversations")
      .insert({ user_id: userId, channel })
      .select("id")
      .single();
    conversationId = created?.id;
  }

  if (!conversationId) return;

  await client.from("conversation_messages").insert({
    user_id: userId,
    conversation_id: conversationId,
    direction: role === "user" ? "inbound" : "outbound",
    role,
    content,
  });

  await client
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId);
}

async function recordUsage(
  client: Client,
  userId: string,
  result: { usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number }; costEstimate: number },
): Promise<void> {
  await client.from("ai_usage").insert({
    user_id: userId,
    model: getModel(),
    purpose: "assistant",
    input_tokens: result.usage.inputTokens,
    output_tokens: result.usage.outputTokens,
    cache_read_tokens: result.usage.cacheReadTokens,
    cost_estimate: result.costEstimate,
  });
}
