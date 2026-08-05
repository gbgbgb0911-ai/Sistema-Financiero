"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteExpenseAction } from "@/modules/expenses/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";

export function DeleteExpenseButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onDelete() {
    startTransition(async () => {
      const result = await deleteExpenseAction(id);
      if (!result.ok) {
        toast.error(result.error?.message ?? "No se pudo anular el gasto");
        return;
      }
      toast.success("Gasto anulado");
      router.push("/gastos");
      router.refresh();
    });
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive">
          <Trash2 className="h-4 w-4" />
          Anular gasto
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Anular este gasto?</DialogTitle>
          <DialogDescription>
            El gasto deja de contar en tus totales, pero se conserva en el historial de
            auditoría. No se elimina de forma permanente.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancelar</Button>
          </DialogClose>
          <Button variant="destructive" onClick={onDelete} disabled={pending}>
            Anular
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
