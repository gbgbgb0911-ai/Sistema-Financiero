"use client";

import { useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/server/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

/**
 * Acceso por enlace mágico o Google.
 *
 * Sin contraseñas a propósito: una contraseña más que recordar es fricción y
 * una superficie de ataque adicional, y el enlace por correo cubre el caso.
 */
export function LoginForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleMagicLink(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });

      if (error) throw error;
      setSent(true);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo enviar el enlace de acceso",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo iniciar sesión");
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
          <div className="rounded-full bg-success/10 p-3">
            <Mail className="h-5 w-5 text-success" />
          </div>
          <div className="space-y-1">
            <p className="font-medium">Revisa tu correo</p>
            <p className="text-sm text-muted-foreground">
              Enviamos un enlace de acceso a <span className="font-medium">{email}</span>.
              Caduca en una hora.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setSent(false)}>
            Usar otro correo
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <form onSubmit={handleMagicLink} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="email">Correo electrónico</Label>
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="tu@correo.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              disabled={loading}
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading || !email}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Enviar enlace de acceso
          </Button>
        </form>

        <div className="relative">
          <Separator />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
            o
          </span>
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={handleGoogle}
          disabled={loading}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
            <path
              fill="currentColor"
              d="M12 11v3.2h5.3a4.6 4.6 0 0 1-2 3l3.2 2.5A8.9 8.9 0 0 0 21 12c0-.6-.1-1.3-.2-1.8H12Z"
            />
            <path
              fill="currentColor"
              d="M6.6 14.3 5.9 14.9 3.4 16.8A9 9 0 0 0 12 21a8.6 8.6 0 0 0 5.9-2.2l-3.1-2.4a5.4 5.4 0 0 1-8.2-2.1Z"
              opacity=".7"
            />
            <path
              fill="currentColor"
              d="M3.4 7.2A8.9 8.9 0 0 0 3 12c0 1.7.4 3.3 1.1 4.7l3.2-2.5a5.4 5.4 0 0 1 0-3.4L3.4 7.2Z"
              opacity=".5"
            />
            <path
              fill="currentColor"
              d="M12 6.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 3.4 7.2l3.2 2.5A5.4 5.4 0 0 1 12 6.6Z"
              opacity=".85"
            />
          </svg>
          Continuar con Google
        </Button>
      </CardContent>
    </Card>
  );
}
