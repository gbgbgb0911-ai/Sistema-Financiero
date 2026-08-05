"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Receipt, Plus, CalendarClock, Menu } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Barra inferior en móvil.
 *
 * Cinco destinos: los cuatro más usados más "Más". La acción primaria —
 * registrar un gasto — va en el centro, la zona más cómoda para el pulgar,
 * y nunca queda a más de un toque desde cualquier pantalla.
 */
const ITEMS = [
  { href: "/dashboard", label: "Resumen", icon: LayoutDashboard },
  { href: "/gastos", label: "Gastos", icon: Receipt },
  { href: "/gastos/nuevo", label: "Añadir", icon: Plus, primary: true },
  { href: "/pagos", label: "Pagos", icon: CalendarClock },
  { href: "/ajustes", label: "Más", icon: Menu },
] as const;

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur lg:hidden"
      aria-label="Navegación principal"
    >
      <ul className="flex items-stretch justify-around pb-[env(safe-area-inset-bottom)]">
        {ITEMS.map((item) => {
          const active = pathname === item.href;

          if ("primary" in item && item.primary) {
            return (
              <li key={item.href} className="flex items-center px-1">
                <Link
                  href={item.href}
                  aria-label="Registrar gasto"
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-full",
                    "bg-primary text-primary-foreground shadow-lg transition-transform",
                    "active:scale-95",
                  )}
                >
                  <item.icon className="h-5 w-5" aria-hidden />
                </Link>
              </li>
            );
          }

          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  // 56px de alto: por encima del objetivo táctil mínimo.
                  "flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <item.icon className="h-5 w-5" aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
