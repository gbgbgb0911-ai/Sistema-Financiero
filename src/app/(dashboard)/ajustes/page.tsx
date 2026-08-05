import type { Metadata } from "next";
import { CheckCircle2, XCircle, Mail } from "lucide-react";
import { requireUser, createServerSupabase } from "@/server/supabase/server";
import { getProfile } from "@/modules/profile/service";
import { getFeatureFlags } from "@/server/env";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProfileSettings } from "@/components/features/settings/ProfileSettings";

export const metadata: Metadata = { title: "Ajustes" };

export default async function SettingsPage() {
  const user = await requireUser();
  const supabase = await createServerSupabase();
  const profile = await getProfile(supabase, user.id);
  const flags = getFeatureFlags();

  const { data: emailAccounts } = await supabase
    .from("email_accounts")
    .select("id, email, last_synced_at, sync_status")
    .eq("user_id", user.id);

  const integrations = [
    { key: "ai", label: "Asistente de IA", enabled: flags.ai, hint: "ANTHROPIC_API_KEY" },
    { key: "whatsapp", label: "WhatsApp", enabled: flags.whatsapp, hint: "WHATSAPP_TOKEN" },
    { key: "gmail", label: "Gmail", enabled: flags.gmail, hint: "GOOGLE_CLIENT_ID" },
    { key: "cron", label: "Tareas programadas", enabled: flags.cron, hint: "CRON_SECRET" },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-4 animate-in-view">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Perfil y preferencias</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileSettings profile={profile} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Correo</CardTitle>
          <p className="text-xs text-muted-foreground">
            Al conectar Gmail se detectan automáticamente los cargos de tus correos bancarios.
            Solo se pide permiso de lectura.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {(emailAccounts ?? []).length > 0 ? (
            <ul className="space-y-2">
              {(emailAccounts ?? []).map((account) => (
                <li
                  key={account.id}
                  className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm"
                >
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{account.email}</span>
                  <Badge variant={account.sync_status === "error" ? "destructive" : "success"}>
                    {account.sync_status === "error" ? "Con errores" : "Conectada"}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Ninguna cuenta conectada.</p>
          )}

          <Button asChild variant="outline" size="sm" disabled={!flags.gmail}>
            <a href="/api/gmail/connect">Conectar Gmail</a>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Integraciones</CardTitle>
          <p className="text-xs text-muted-foreground">
            Cada integración se activa al configurar su variable de entorno. La aplicación
            funciona sin ninguna de ellas.
          </p>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border/60">
            {integrations.map((integration) => (
              <li key={integration.key} className="flex items-center gap-3 py-2.5 text-sm">
                {integration.enabled ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />
                ) : (
                  <XCircle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <span className="flex-1">{integration.label}</span>
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                  {integration.hint}
                </code>
                <span className="w-20 text-right text-xs text-muted-foreground">
                  {integration.enabled ? "Activa" : "No configurada"}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
