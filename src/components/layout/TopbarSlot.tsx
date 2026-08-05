"use client";

import { usePathname } from "next/navigation";
import { Topbar } from "./Topbar";

const TITLES: Record<string, string> = {
  "/dashboard": "Resumen",
  "/gastos": "Gastos",
  "/gastos/nuevo": "Nuevo gasto",
  "/pagos": "Pagos programados",
  "/pagos/nuevo": "Nuevo pago",
  "/calendario": "Calendario",
  "/tarjetas": "Tarjetas",
  "/categorias": "Categorías y presupuestos",
  "/reportes": "Reportes",
  "/asistente": "Asistente",
  "/ajustes": "Ajustes",
};

export function TopbarSlot({
  userName,
  userEmail,
}: {
  userName: string | null;
  userEmail: string | null;
}) {
  const pathname = usePathname();

  const title =
    TITLES[pathname] ??
    Object.entries(TITLES).find(([key]) => key !== "/" && pathname.startsWith(key))?.[1] ??
    "Finanzas";

  return <Topbar title={title} userName={userName} userEmail={userEmail} />;
}
