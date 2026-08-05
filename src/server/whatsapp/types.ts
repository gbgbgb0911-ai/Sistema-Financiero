/** Subconjunto del payload de WhatsApp Cloud API que consume el sistema. */

export interface WhatsAppTextMessage {
  from: string;
  id: string;
  timestamp: string;
  type: "text";
  text: { body: string };
}

export interface WhatsAppInteractiveMessage {
  from: string;
  id: string;
  timestamp: string;
  type: "interactive";
  interactive: {
    type: "button_reply" | "list_reply";
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string };
  };
}

export interface WhatsAppButtonMessage {
  from: string;
  id: string;
  timestamp: string;
  type: "button";
  button: { text: string; payload: string };
}

export type WhatsAppMessage =
  | WhatsAppTextMessage
  | WhatsAppInteractiveMessage
  | WhatsAppButtonMessage
  | { from: string; id: string; timestamp: string; type: string };

export interface WhatsAppWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      field: string;
      value: {
        messaging_product: string;
        metadata: { display_phone_number: string; phone_number_id: string };
        contacts?: Array<{ profile: { name: string }; wa_id: string }>;
        messages?: WhatsAppMessage[];
        statuses?: Array<{ id: string; status: string; recipient_id: string }>;
      };
    }>;
  }>;
}

/** Extrae el texto de un mensaje sea cual sea su tipo. */
export function extractMessageText(message: WhatsAppMessage): string | null {
  if (message.type === "text" && "text" in message) {
    return message.text.body;
  }
  if (message.type === "interactive" && "interactive" in message) {
    const { interactive } = message;
    return interactive.button_reply?.title ?? interactive.list_reply?.title ?? null;
  }
  if (message.type === "button" && "button" in message) {
    return message.button.text;
  }
  return null;
}
