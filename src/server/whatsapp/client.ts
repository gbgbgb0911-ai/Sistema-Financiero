import { withRetry } from "@/lib/utils";

/**
 * Envío de mensajes por WhatsApp Cloud API.
 *
 * Si falta configuración, el envío se registra en consola y se devuelve un
 * identificador simulado. Así los flujos completos (recordatorios, reportes)
 * son ejecutables y depurables en desarrollo sin una cuenta de Meta.
 */

const API_VERSION = "v21.0";

export interface SendResult {
  ok: boolean;
  messageId: string | null;
  error?: string;
  /** `true` si no se envió de verdad por falta de configuración. */
  simulated?: boolean;
}

export function isWhatsAppConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

export async function sendWhatsAppText(to: string, body: string): Promise<SendResult> {
  if (!isWhatsAppConfigured()) {
    console.info(`[whatsapp:simulado] → ${to}: ${body}`);
    return { ok: true, messageId: `simulated-${Date.now()}`, simulated: true };
  }

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID!;
  const token = process.env.WHATSAPP_TOKEN!;

  try {
    const response = await withRetry(
      async () => {
        const res = await fetch(
          `https://graph.facebook.com/${API_VERSION}/${phoneNumberId}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              recipient_type: "individual",
              to: to.replace(/^\+/, ""),
              type: "text",
              // Sin previsualización de enlaces: los mensajes financieros no la
              // necesitan y agranda la burbuja innecesariamente.
              text: { preview_url: false, body },
            }),
          },
        );

        if (!res.ok) {
          const detail = await res.text();
          throw new Error(`WhatsApp respondió ${res.status}: ${detail}`);
        }
        return res.json() as Promise<{ messages?: Array<{ id: string }> }>;
      },
      { attempts: 3, baseDelayMs: 500 },
    );

    return { ok: true, messageId: response.messages?.[0]?.id ?? null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "error desconocido";
    console.error("[whatsapp] fallo al enviar:", message);
    return { ok: false, messageId: null, error: message };
  }
}

/**
 * Mensaje con botones de respuesta rápida.
 *
 * Los recordatorios lo usan para que responder sea un toque en lugar de
 * escribir. Meta permite un máximo de tres botones.
 */
export async function sendWhatsAppButtons(
  to: string,
  body: string,
  buttons: Array<{ id: string; title: string }>,
): Promise<SendResult> {
  if (!isWhatsAppConfigured()) {
    console.info(
      `[whatsapp:simulado] → ${to}: ${body} [${buttons.map((b) => b.title).join(" | ")}]`,
    );
    return { ok: true, messageId: `simulated-${Date.now()}`, simulated: true };
  }

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID!;
  const token = process.env.WHATSAPP_TOKEN!;

  try {
    const res = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: to.replace(/^\+/, ""),
          type: "interactive",
          interactive: {
            type: "button",
            body: { text: body },
            action: {
              // El título del botón no puede superar 20 caracteres.
              buttons: buttons.slice(0, 3).map((b) => ({
                type: "reply",
                reply: { id: b.id, title: b.title.slice(0, 20) },
              })),
            },
          },
        }),
      },
    );

    if (!res.ok) {
      const detail = await res.text();
      return { ok: false, messageId: null, error: `${res.status}: ${detail}` };
    }

    const data = (await res.json()) as { messages?: Array<{ id: string }> };
    return { ok: true, messageId: data.messages?.[0]?.id ?? null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "error desconocido";
    return { ok: false, messageId: null, error: message };
  }
}
