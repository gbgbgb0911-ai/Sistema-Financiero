import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/server/supabase/server";

export const dynamic = "force-dynamic";

/** Intercambia el código de OAuth / enlace mágico por una sesión. */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next") ?? "/dashboard";

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", request.url));
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/login?error=auth_failed", request.url));
  }

  return NextResponse.redirect(new URL(next, request.url));
}
