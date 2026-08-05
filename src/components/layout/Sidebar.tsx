"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Receipt,
  CalendarClock,
  Calendar,
  CreditCard,
  Tags,
  FileBarChart,
  Sparkles,
  Settings,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Resumen", icon: LayoutDashboard },
  { href: "/gastos", label: "Gastos", icon: Receipt },
  { href: "/pagos", label: "Pagos", icon: CalendarClock },
  { href: "/calendario", label: "Calendario", icon: Calendar },
  { href: "/tarjetas", label: "Tarjetas", icon: CreditCard },
  { href: "/categorias", label: "Categorías", icon: Tags },
  { href: "/reportes", label: "Reportes", icon: FileBarChart },
  { href: "/asistente", label: "Asistente", icon: Sparkles },
  { href: "/ajustes", label: "Ajustes", icon: Settings },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card/40 lg:flex">
      <div className="flex h-14 items-center gap-2.5 border-b border-border px-5">
        <div className="rounded-lg bg-primary p-1.5 text-primary-foreground">
          <Wallet className="h-4 w-4" />
        </div>
        <span className="font-semibold tracking-tight">{APP_NAME}</span>
      </div>

      <nav className="flex-1 space-y-0.5 p-3" aria-label="Navegación principal">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
                "transition-colors duration-150",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
