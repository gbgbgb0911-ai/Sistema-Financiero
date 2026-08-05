import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { createAdminClient } from "@/server/supabase/admin";
import {
  verifyWhatsAppSignature,
  verifyWebhookChallenge,
} from "@/server/whatsapp/signature";
import { sendWhatsAppText } from "@/server/whatsapp/client";
import { extractMessageText, type WhatsAppWebhookPayload } from "@/server/whatsapp/types";
import type { Json } from "@/types/database";
import { findProfileByPhone } from "@/modules/profile/repository";
import { handleIncomingMessage } from "@/modules/assistant/service";
import { applyOccurrenceAction } from "@/modules/payments/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Handshake de verificación que hace Meta al registrar la URL del webhook. */
export async function GET(request: NextRequest) {
  const challenge = verifyWebhookChallenge(request.nextUrl.searchParams);

  if (challenge === null) {
    return new NextResponse("Verificación fallida", { status: 403 });
  }
  return new NextResponse(challenge, { status: 200 });
}

/**
 * Recepción de mensajes.
 *
 * Meta reintenta la entrega si el webhook tarda más de ~20 s, lo que produciría
 * respuestas duplicadas al usuario. Por eso el handler solo persiste el mensaje
 * y responde 200 de inmediato; el procesamiento (que incluye llamar al modelo)
 * ocurre en `after()`, ya fuera del ciclo de respuesta.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  if (!verifyWhatsAppSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return new NextResponse("Firma inválida", { status: 401 });
  }

  let payload: WhatsAppWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WhatsAppWebhookPayload;
  } catch {
    return new NextResponse("JSON inválido", { status: 400 });
  }

  const messages = payload.entry?.flatMap((entry) =>
    entry.changes?.flatMap((change) => change.value.messages ?? []),
  );

  if (!messages || messages.length === 0) {
    // Suele ser una actualización de estado (entregado/leído): se reconoce y ya.
    return NextResponse.json({ ok: true });
  }

  const supabase = createAdminClient();

  for (const message of messages) {
    const text = extractMessageText(message);
    if (!text) continue;

    // El UNIQUE sobre provider_message_id es la garantía de idempotencia:
    // si Meta reintenta, la inserción falla y no se procesa dos veces.
    const { data: inserted, error } = await supabase
      .from("inbound_messages")
      .insert({
        provider_message_id: message.id,
        channel: "whatsapp",
        from_phone: message.from,
        body: text,
        raw_payload: message as unknown as Json,
        status: "queued",
      })
      .select("id")
      .maybeSingle();

    if (error || !inserted) continue;

    const messageId = inserted.id;
    const fromPhone = message.from;
    const buttonId =
      message.type === "interactive" && "interactive" in message
        ? message.interactive.button_reply?.id
        : undefined;

    // Trabajo posterior a la respuesta: Next mantiene vivo el proceso hasta que
    // termina, sin que Meta espere.
    after(async () => {
      await processInboundMessage(messageId, fromPhone, text, buttonId);
    });
  }

  return NextResponse.json({ ok: true });
}

async function processInboundMessage(
  inboundId: string,
  fromPhone: string,
  text: string,
  buttonId?: string,
): Promise<void> {
  const supabase = createAdminClient();

  try {
    await supabase
      .from("inbound_messages")
      .update({ status: "processing" })
      .eq("id", inboundId);

    const profile = await findProfileByPhone(supabase, fromPhone);

    if (!profile) {
      await sendWhatsAppText(
        fromPhone,
        "No encuentro una cuenta asociada a este número. Entra en la aplicación, " +
          "ve a Ajustes y registra tu teléfono para poder usar el asistente por aquí.",
      );
      await supabase
        .from("inbound_messages")
        .update({ status: "done", processed_at: new Date().toISOString() })
        .eq("id", inboundId);
      return;
    }

    await supabase
      .from("inbound_messages")
      .update({ user_id: profile.id })
      .eq("id", inboundId);

    let reply: string;

    // Los botones de los recordatorios traen la acción y el id del vencimiento
    // codificados, así que no hace falta interpretación de lenguaje.
    if (buttonId?.includes(":")) {
      const [action, occurrenceId] = buttonId.split(":");
      const mapped =
        action === "pay"
          ? { occurrenceId: occurrenceId!, action: "pay" as const }
          : action === "snooze"
            ? { occurrenceId: occurrenceId!, action: "snooze" as const, value: 3 }
            : { occurrenceId: occurrenceId!, action: "postpone" as const, value: 3 };

      const result = await applyOccurrenceAction(supabase, profile.id, mapped);
      reply = result.message;
    } else {
      const result = await handleIncomingMessage(supabase, profile, text, "whatsapp");
      reply = result.reply;
    }

    const sendResult = await sendWhatsAppText(fromPhone, reply);

    await supabase.from("notifications").insert({
      user_id: profile.id,
      channel: "whatsapp",
      status: sendResult.ok ? "sent" : "failed",
      body: reply,
      provider_message_id: sendResult.messageId,
      error: sendResult.error ?? null,
      sent_at: sendResult.ok ? new Date().toISOString() : null,
    });

    await supabase
      .from("inbound_messages")
      .update({ status: "done", processed_at: new Date().toISOString() })
      .eq("id", inboundId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "error desconocido";
    console.error("[whatsapp] fallo al procesar mensaje:", message);

    await supabase
      .from("inbound_messages")
      .update({ status: "failed", error: message })
      .eq("id", inboundId);

    // El usuario debe recibir algo aunque el procesamiento falle: quedarse en
    // silencio es peor que un mensaje de error.
    await sendWhatsAppText(
      fromPhone,
      "Tuve un problema procesando tu mensaje. Inténtalo de nuevo en un momento.",
    );
  }
}
