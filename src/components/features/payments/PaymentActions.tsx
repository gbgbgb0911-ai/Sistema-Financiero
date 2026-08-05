"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, CalendarPlus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { occurrenceActionHandler } from "@/modules/payments/actions";
import { Button } from "@/components/ui/button";

/**
 * Acciones sobre un vencimiento.
 *
 * Son las mismas cuatro que ofrece el recordatorio de WhatsApp, con la misma
 * implementación detrás, para que el comportamiento no diverja entre canales.
 */
export function PaymentActions({ occurrenceId }: { occurrenceId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(action: "pay" | "snooze" | "postpone" | "skip", value?: number) {
    startTransition(async () => {
      const result = await occurrenceActionHandler({ occurrenceId, action, value });
      if (!result.ok) {
        toast.error(result.error?.message ?? "No se pudo aplicar la acción");
        return;
      }
      toast.success(result.data?.message ?? "Listo");
      router.refresh();
    });
  }

  if (pending) {
    return (
      <Button variant="ghost" size="icon-sm" disabled>
        <Loader2 className="h-4 w-4 animate-spin" />
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => run("pay")}
        title="Marcar como pagado"
        aria-label="Marcar como pagado"
      >
        <Check className="h-4 w-4 text-success" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => run("snooze", 3)}
        title="Recordarme en 3 horas"
        aria-label="Recordarme en 3 horas"
      >
        <Clock className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => run("postpone", 3)}
        title="Posponer 3 días"
        aria-label="Posponer 3 días"
      >
        <CalendarPlus className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => run("skip")}
        title="Omitir este vencimiento"
        aria-label="Omitir este vencimiento"
      >
        <X className="h-4 w-4 text-muted-foreground" />
      </Button>
    </div>
  );
}
