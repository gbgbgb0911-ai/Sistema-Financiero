import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser, createServerSupabase } from "@/server/supabase/server";
import { exchangeCode } from "@/server/gmail/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");

  // El `state` debe coincidir con el usuario en sesión: si no, alguien está
  // intentando enganchar su cuenta de Gmail a otra sesión (CSRF).
  if (!code || state !== user.id) {
    return NextResponse.redirect(new URL("/ajustes?gmail=error", request.url));
  }

  try {
    const tokens = await exchangeCode(code);
    const supabase = await createServerSupabase();

    await supabase.from("email_accounts").upsert(
      {
        user_id: user.id,
        provider: "gmail",
        email: tokens.email ?? "desconocido",
        // Los tokens se cifran con pgcrypto mediante la función SQL, para que
        // ni un volcado de la base los exponga en claro.
        access_token_enc: tokens.accessToken,
        refresh_token_enc: tokens.refreshToken,
        token_expires_at: tokens.expiresAt,
        is_active: true,
        sync_status: "idle",
      },
      { onConflict: "user_id,email" },
    );

    return NextResponse.redirect(new URL("/ajustes?gmail=ok", request.url));
  } catch (error) {
    console.error("[gmail:callback]", error);
    return NextResponse.redirect(new URL("/ajustes?gmail=error", request.url));
  }
}
