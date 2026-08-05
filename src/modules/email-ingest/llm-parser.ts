import { getAnthropic, getModel, isAiConfigured } from "@/server/anthropic/client";
import { EMAIL_EXTRACTION_PROMPT } from "@/server/anthropic/prompts";
import { htmlToText, truncate } from "@/core/text";
import type { EmailInput, ParsedTransaction } from "./parser";

/**
 * Parser de correos — nivel 2 (LLM).
 *
 * Se invoca solo cuando ninguna regla determinista encaja. Usa
 * `output_config.format` para que el modelo devuelva JSON válido contra un
 * esquema, en lugar de texto libre que habría que parsear.
 */

const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    amount: { type: ["number", "null"] },
    currency: { type: ["string", "null"], enum: ["PEN", "USD", "EUR", null] },
    merchant: { type: ["string", "null"] },
    cardLast4: { type: ["string", "null"] },
    occurredAt: { type: ["string", "null"] },
    transactionType: {
      type: "string",
      enum: ["purchase", "withdrawal", "transfer", "payment", "refund", "unknown"],
    },
    confidence: { type: "number" },
  },
  required: [
    "amount",
    "currency",
    "merchant",
    "cardLast4",
    "occurredAt",
    "transactionType",
    "confidence",
  ],
  additionalProperties: false,
} as const;

export async function parseWithLlm(email: EmailInput): Promise<ParsedTransaction | null> {
  if (!isAiConfigured()) return null;

  const client = getAnthropic();

  // El cuerpo se recorta: los correos bancarios traen pies de página enormes y
  // el dato relevante está siempre arriba.
  const body = truncate(htmlToText(email.body), 6000);

  try {
    const response = await client.messages.create({
      model: getModel(),
      max_tokens: 2_000,
      // Extracción estructurada: no necesita razonamiento profundo y la
      // latencia importa porque se procesan varios correos por sync.
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: EXTRACTION_SCHEMA },
      },
      system: [
        {
          type: "text",
          text: EMAIL_EXTRACTION_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          // El correo va delimitado y etiquetado como datos. El prompt del
          // sistema ya indica que su contenido no son instrucciones: es la
          // defensa contra un correo que intente inyectar órdenes.
          content: `<correo>
De: ${email.from}
Asunto: ${email.subject}
Recibido: ${email.receivedAt}

${body}
</correo>`,
        },
      ],
    });

    if (response.stop_reason === "refusal") return null;

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") return null;

    const parsed = JSON.parse(textBlock.text) as {
      amount: number | null;
      currency: "PEN" | "USD" | "EUR" | null;
      merchant: string | null;
      cardLast4: string | null;
      occurredAt: string | null;
      transactionType: ParsedTransaction["transactionType"];
      confidence: number;
    };

    return {
      amount: parsed.amount,
      currency: parsed.currency,
      merchant: parsed.merchant,
      cardLast4: parsed.cardLast4,
      occurredAt: parsed.occurredAt ?? email.receivedAt,
      transactionType: parsed.transactionType,
      // Se aplica un descuento sobre la confianza declarada por el modelo: es
      // sistemáticamente optimista al autoevaluarse, y aquí un falso positivo
      // registra un gasto que no existió.
      confidence: Math.min(parsed.confidence * 0.9, 0.95),
      method: "llm",
    };
  } catch (error) {
    console.error("[email-parser] fallo en la extracción con IA:", error);
    return null;
  }
}
