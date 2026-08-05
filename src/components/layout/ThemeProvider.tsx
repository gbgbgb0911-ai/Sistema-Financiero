"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Tema claro/oscuro.
 * `defaultTheme="system"` respeta la preferencia del sistema operativo, que es
 * lo que la persona ya eligió una vez y no debería tener que repetir.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
