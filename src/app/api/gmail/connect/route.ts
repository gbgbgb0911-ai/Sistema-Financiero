import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/supabase/server";
import { getAuthUrl, isGmailConfigured } from "@/server/gmail/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return new NextResponse("No autorizado", { status: 401 });

  if (!isGmailConfigured()) {
    return NextResponse.json(
      { error: "La integración con Gmail no está configurada." },
      { status: 503 },
    );
  }

  // El `state` lleva el id de usuario: es lo que permite asociar el callback
  // con la cuenta correcta sin depender de la sesión en el redirect de Google.
  return NextResponse.redirect(getAuthUrl(user.id));
}
