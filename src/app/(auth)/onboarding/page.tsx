import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser, createServerSupabase } from "@/server/supabase/server";
import { getProfile } from "@/modules/profile/service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileSettings } from "@/components/features/settings/ProfileSettings";

export const metadata: Metadata = { title: "Configuración inicial" };

export default async function OnboardingPage() {
  const user = await requireUser();
  const supabase = await createServerSupabase();
  const profile = await getProfile(supabase, user.id);

  if (profile.onboarded_at) redirect("/dashboard");

  return (
    <div className="w-full max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle>Configura tu cuenta</CardTitle>
          <p className="text-sm text-muted-foreground">
            La moneda y la zona horaria afectan a todos los cálculos, así que conviene
            definirlas antes de empezar a registrar gastos.
          </p>
        </CardHeader>
        <CardContent>
          <ProfileSettings profile={profile} />
        </CardContent>
      </Card>
    </div>
  );
}
