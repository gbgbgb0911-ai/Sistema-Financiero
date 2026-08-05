import { redirect } from "next/navigation";
import { getSessionUser, createServerSupabase } from "@/server/supabase/server";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { TopbarSlot } from "@/components/layout/TopbarSlot";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const supabase = await createServerSupabase();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div className="flex min-h-dvh bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopbarSlot userName={profile?.full_name ?? null} userEmail={user.email ?? null} />
        {/* pb-20 en móvil para que la barra inferior no tape el contenido. */}
        <main className="flex-1 px-4 pb-24 pt-5 lg:px-6 lg:pb-8">{children}</main>
      </div>
      <MobileNav />
    </div>
  );
}
