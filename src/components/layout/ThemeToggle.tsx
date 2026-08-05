"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Conmutador de tema.
 *
 * Los dos iconos se renderizan siempre y se alternan con CSS (`dark:`) en lugar
 * de con un estado `mounted`. next-themes escribe la clase `dark` en el <html>
 * antes de la hidratación, así que no hay desajuste — y se evita el render en
 * cascada que provoca un `setState` dentro de un efecto.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label="Cambiar entre tema claro y oscuro"
    >
      <Sun className="hidden h-4 w-4 dark:block" aria-hidden />
      <Moon className="h-4 w-4 dark:hidden" aria-hidden />
    </Button>
  );
}
