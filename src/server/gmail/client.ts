import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { DomainError } from "@/core/errors";

/**
 * Integración con Gmail.
 *
 * Se usa el scope mínimo (`gmail.readonly`): el sistema solo necesita leer, y
 * pedir permisos de escritura complicaría la verificación de Google sin aportar
 * nada.
 */

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

export function isGmailConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function createOAuthClient(redirectUri?: string): OAuth2Client {
  if (!isGmailConfigured()) throw DomainError.integrationUnavailable("Gmail");

  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri ?? `${process.env.NEXT_PUBLIC_APP_URL}/api/gmail/callback`,
  );
}

export function getAuthUrl(state: string): string {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    // `consent` fuerza la entrega del refresh_token; sin él, el sync deja de
    // funcionar cuando expira el access_token y no hay forma de renovarlo.
    prompt: "consent",
    state,
  });
}

export async function exchangeCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  email: string | null;
}> {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const { data } = await oauth2.userinfo.get();

  return {
    accessToken: tokens.access_token ?? "",
    refreshToken: tokens.refresh_token ?? null,
    expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
    email: data.email ?? null,
  };
}

export interface GmailMessage {
  id: string;
  from: string;
  subject: string;
  body: string;
  receivedAt: string;
}

/**
 * Lista y descarga mensajes que parecen notificaciones bancarias.
 *
 * Se filtra en el servidor de Gmail con un `q` acotado en vez de traerlo todo
 * y filtrar aquí: reduce cuota, latencia y datos transferidos.
 */
export async function fetchRecentBankEmails(
  accessToken: string,
  refreshToken: string | null,
  options: { maxResults?: number; newerThanDays?: number } = {},
): Promise<GmailMessage[]> {
  const { maxResults = 25, newerThanDays = 7 } = options;

  const auth = createOAuthClient();
  auth.setCredentials({
    access_token: accessToken,
    ...(refreshToken ? { refresh_token: refreshToken } : {}),
  });

  const gmail = google.gmail({ version: "v1", auth });

  const query = [
    `newer_than:${newerThanDays}d`,
    "-category:promotions",
    "-category:social",
    "(consumo OR compra OR cargo OR transacción OR operación OR purchase OR transaction)",
  ].join(" ");

  const list = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults,
  });

  const ids = (list.data.messages ?? []).map((m) => m.id).filter(Boolean) as string[];
  if (ids.length === 0) return [];

  const messages = await Promise.all(
    ids.map(async (id) => {
      try {
        const detail = await gmail.users.messages.get({ userId: "me", id, format: "full" });
        return toGmailMessage(id, detail.data as GmailApiMessage);
      } catch {
        return null;
      }
    }),
  );

  return messages.filter((m): m is GmailMessage => m !== null);
}

/**
 * Forma mínima del mensaje de Gmail que se necesita.
 *
 * Se declara a mano en lugar de derivarla de `googleapis` porque los tipos
 * generados por Google cambian de forma entre versiones menores, y aquí solo
 * hacen falta cuatro campos.
 */
interface GmailPayloadPart {
  mimeType?: string | null;
  headers?: Array<{ name?: string | null; value?: string | null }> | null;
  body?: { data?: string | null } | null;
  parts?: GmailPayloadPart[] | null;
}

interface GmailApiMessage {
  payload?: GmailPayloadPart | null;
  internalDate?: string | null;
}

function toGmailMessage(id: string, data: GmailApiMessage): GmailMessage | null {
  const headers = data.payload?.headers ?? [];
  const header = (name: string): string =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

  const body = extractBody(data.payload);
  if (!body) return null;

  return {
    id,
    from: header("From"),
    subject: header("Subject"),
    body,
    receivedAt: data.internalDate
      ? new Date(Number(data.internalDate)).toISOString()
      : new Date().toISOString(),
  };
}

/**
 * Extrae el cuerpo recorriendo las partes MIME.
 * Se prefiere `text/plain`; si solo hay HTML, se devuelve y el parser lo
 * convierte a texto.
 */
function extractBody(payload: GmailPayloadPart | null | undefined): string {
  if (!payload) return "";

  const decode = (data: string): string => Buffer.from(data, "base64url").toString("utf8");

  if (payload.body?.data) return decode(payload.body.data);

  const parts = payload.parts ?? [];

  const plain = parts.find((p) => p.mimeType === "text/plain" && p.body?.data);
  if (plain?.body?.data) return decode(plain.body.data);

  const html = parts.find((p) => p.mimeType === "text/html" && p.body?.data);
  if (html?.body?.data) return decode(html.body.data);

  // multipart/alternative anidado
  for (const part of parts) {
    if (part.parts) {
      const nested = extractBody(part);
      if (nested) return nested;
    }
  }

  return "";
}
