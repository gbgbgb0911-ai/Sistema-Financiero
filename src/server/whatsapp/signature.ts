import crypto from "node:crypto";

/**
 * Verificación de la firma del webhook de Meta.
 *
 * Sin esto, cualquiera que conozca la URL puede inyectar mensajes falsos y,
 * a través del asistente, escribir gastos en la cuenta de otra persona.
 */
export function verifyWhatsAppSignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;

  if (!appSecret) {
    // Sin secreto configurado no se puede verificar. Se rechaza en producción
    // en vez de aceptar a ciegas: fallar abierto aquí sería una puerta trasera.
    return process.env.NODE_ENV !== "production";
  }

  if (!signatureHeader?.startsWith("sha256=")) return false;

  const expected = crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const received = signatureHeader.slice("sha256=".length);

  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(received, "hex");

  // Longitudes distintas harían lanzar a timingSafeEqual.
  if (expectedBuffer.length !== receivedBuffer.length) return false;

  // Comparación en tiempo constante: una comparación normal filtra información
  // sobre el prefijo correcto de la firma.
  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

/** Verificación del handshake inicial (GET) que hace Meta al registrar la URL. */
export function verifyWebhookChallenge(params: URLSearchParams): string | null {
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!expectedToken) return null;

  if (mode === "subscribe" && token === expectedToken) return challenge;
  return null;
}
