import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, getModel, extractUsage, estimateCost } from "./client";
import { buildAssistantSystemPrompt, type AssistantContext } from "./prompts";
import { ASSISTANT_TOOLS, executeTool, type ToolContext } from "./tools";
import { MAX_TOOL_ROUNDS } from "@/lib/constants";

/**
 * Bucle agéntico.
 *
 * Se implementa a mano en lugar de usar el tool runner del SDK porque cada tool
 * necesita el contexto del usuario (cliente de Supabase + userId), y porque
 * interesa controlar explícitamente el número de rondas y registrar el consumo
 * de tokens de cada iteración.
 */

export interface AgentTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AgentResult {
  text: string;
  toolsUsed: string[];
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
  costEstimate: number;
  rounds: number;
}

export interface RunAgentOptions {
  history?: AgentTurn[];
  /** `low` para lecturas simples, `high` para análisis. Ajusta costo y latencia. */
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}

export async function runAssistant(
  userMessage: string,
  assistantContext: AssistantContext,
  toolContext: ToolContext,
  options: RunAgentOptions = {},
): Promise<AgentResult> {
  const client = getAnthropic();
  const model = getModel();
  const { history = [], effort = "medium", maxTokens = 8_000 } = options;

  const systemPrompt = buildAssistantSystemPrompt(assistantContext);

  const messages: Anthropic.MessageParam[] = [
    ...history.map((turn) => ({ role: turn.role, content: turn.content }) as Anthropic.MessageParam),
    { role: "user", content: userMessage },
  ];

  const toolsUsed: string[] = [];
  const totals = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
  let rounds = 0;

  while (rounds < MAX_TOOL_ROUNDS) {
    rounds++;

    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      // El prompt de sistema es estable entre peticiones: se marca para caché
      // y así el prefijo (tools + system) no se reprocesa en cada turno.
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      output_config: { effort },
      tools: ASSISTANT_TOOLS,
      messages,
    });

    const usage = extractUsage(response.usage);
    totals.inputTokens += usage.inputTokens;
    totals.outputTokens += usage.outputTokens;
    totals.cacheReadTokens += usage.cacheReadTokens;

    // Los clasificadores de seguridad pueden rechazar la petición: llega un 200
    // con `stop_reason: "refusal"` y `content` vacío. Hay que comprobarlo antes
    // de leer el contenido.
    if (response.stop_reason === "refusal") {
      return {
        text: "No puedo ayudarte con esa consulta. Puedo responder sobre tus gastos, pagos y tarjetas.",
        toolsUsed,
        usage: totals,
        costEstimate: estimateCost(totals),
        rounds,
      };
    }

    messages.push({ role: "assistant", content: response.content });

    const toolUses = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );

    if (toolUses.length === 0) {
      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();

      return {
        text: text || "No tengo una respuesta para eso.",
        toolsUsed,
        usage: totals,
        costEstimate: estimateCost(totals),
        rounds,
      };
    }

    // Las tools se ejecutan en paralelo y TODOS los resultados vuelven en un
    // único mensaje de usuario. Repartirlos en varios mensajes le enseña al
    // modelo a dejar de pedir llamadas paralelas.
    const results = await Promise.all(
      toolUses.map(async (toolUse) => {
        toolsUsed.push(toolUse.name);
        const output = await executeTool(
          toolUse.name,
          toolUse.input as Record<string, unknown>,
          toolContext,
        );
        return {
          type: "tool_result" as const,
          tool_use_id: toolUse.id,
          content: output,
        };
      }),
    );

    messages.push({ role: "user", content: results });
  }

  return {
    text:
      "La consulta requirió demasiados pasos. Prueba a preguntarme algo más concreto, " +
      "como el total de un período o los pagos de esta semana.",
    toolsUsed,
    usage: totals,
    costEstimate: estimateCost(totals),
    rounds,
  };
}

/**
 * Variante en streaming para la interfaz web.
 *
 * Primero resuelve las rondas de tools (que no tienen sentido mostrar token a
 * token) y solo emite en streaming la respuesta final, que es lo que el usuario
 * lee.
 */
export async function* streamAssistant(
  userMessage: string,
  assistantContext: AssistantContext,
  toolContext: ToolContext,
  options: RunAgentOptions = {},
): AsyncGenerator<{ type: "tool" | "text" | "done"; value: string }> {
  const client = getAnthropic();
  const model = getModel();
  const { history = [], effort = "medium", maxTokens = 8_000 } = options;

  const systemPrompt = buildAssistantSystemPrompt(assistantContext);
  const messages: Anthropic.MessageParam[] = [
    ...history.map((turn) => ({ role: turn.role, content: turn.content }) as Anthropic.MessageParam),
    { role: "user", content: userMessage },
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const stream = client.messages.stream({
      model,
      max_tokens: maxTokens,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      output_config: { effort },
      tools: ASSISTANT_TOOLS,
      messages,
    });

    let emittedText = false;
    stream.on("text", (delta) => {
      emittedText = true;
      void delta;
    });

    // Se emiten los deltas conforme llegan; si el turno acaba en tool_use, el
    // texto emitido es solo el preámbulo y la respuesta real llega después.
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield { type: "text", value: event.delta.text };
      }
    }

    const message = await stream.finalMessage();

    if (message.stop_reason === "refusal") {
      yield {
        type: "text",
        value:
          "No puedo ayudarte con esa consulta. Puedo responder sobre tus gastos, pagos y tarjetas.",
      };
      yield { type: "done", value: "" };
      return;
    }

    messages.push({ role: "assistant", content: message.content });

    const toolUses = message.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );

    if (toolUses.length === 0) {
      yield { type: "done", value: "" };
      return;
    }

    void emittedText;

    for (const toolUse of toolUses) {
      yield { type: "tool", value: toolUse.name };
    }

    const results = await Promise.all(
      toolUses.map(async (toolUse) => ({
        type: "tool_result" as const,
        tool_use_id: toolUse.id,
        content: await executeTool(
          toolUse.name,
          toolUse.input as Record<string, unknown>,
          toolContext,
        ),
      })),
    );

    messages.push({ role: "user", content: results });
  }

  yield {
    type: "text",
    value: "La consulta requirió demasiados pasos. Prueba con algo más concreto.",
  };
  yield { type: "done", value: "" };
}
