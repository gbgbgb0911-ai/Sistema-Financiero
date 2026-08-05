import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase, getSessionUser } from "@/server/supabase/server";
import { isAiConfigured } from "@/server/anthropic/client";
import { streamAssistant } from "@/server/anthropic/agent";
import { getProfile } from "@/modules/profile/service";
import { formatDate } from "@/core/dates";
import { DEFAULT_LOCALE } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Chat del asistente en la web, con streaming.
 *
 * Se emite Server-Sent Events porque una respuesta que empieza a aparecer en
 * medio segundo se percibe mucho más rápida que la misma respuesta completa a
 * los cinco segundos.
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return new NextResponse("No autorizado", { status: 401 });

  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: "El asistente no está configurado. Falta ANTHROPIC_API_KEY." },
      { status: 503 },
    );
  }

  const body = (await request.json()) as {
    message?: string;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
  };

  const message = body.message?.trim();
  if (!message) return NextResponse.json({ error: "Mensaje vacío" }, { status: 400 });

  const supabase = await createServerSupabase();
  const profile = await getProfile(supabase, user.id);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: { type: string; value: string }) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        const generator = streamAssistant(
          message,
          {
            userName: profile.full_name,
            timezone: profile.timezone,
            currency: profile.base_currency,
            locale: profile.locale ?? DEFAULT_LOCALE,
            todayLocal: formatDate(
              new Date(),
              profile.timezone,
              profile.locale ?? DEFAULT_LOCALE,
              "datetime",
            ),
            channel: "web",
          },
          {
            client: supabase,
            userId: user.id,
            timezone: profile.timezone,
            currency: profile.base_currency,
            locale: profile.locale ?? DEFAULT_LOCALE,
          },
          { history: body.history ?? [], effort: "medium" },
        );

        for await (const chunk of generator) {
          send(chunk);
        }
      } catch (error) {
        console.error("[ai/chat]", error);
        send({
          type: "text",
          value: "Tuve un problema procesando tu consulta. Inténtalo de nuevo.",
        });
        send({ type: "done", value: "" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
