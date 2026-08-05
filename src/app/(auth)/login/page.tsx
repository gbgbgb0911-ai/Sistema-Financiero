import type { Metadata } from "next";
import { Wallet } from "lucide-react";
import { LoginForm } from "@/components/features/auth/LoginForm";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <div className="w-full max-w-sm animate-in-view">
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <div className="rounded-xl bg-primary p-2.5 text-primary-foreground">
          <Wallet className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{APP_NAME}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Controla tus gastos desde la web y WhatsApp
          </p>
        </div>
      </div>

      <LoginForm />

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Al continuar aceptas que tus datos financieros se almacenen de forma cifrada
        y accesibles únicamente por ti.
      </p>
    </div>
  );
}
