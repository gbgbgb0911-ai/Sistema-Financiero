"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  cardInputSchema,
  type CardInput,
  type CardFormValues,
} from "@/modules/cards/schema";
import { createCardAction } from "@/modules/cards/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CARD_KIND_LABELS } from "@/lib/constants";
import type { CurrencyCode } from "@/core/money";
import type { CardKind } from "@/types/database";

const KINDS: CardKind[] = ["credit", "debit", "cash", "bank_account", "wallet"];

export function CardForm({ currency }: { currency: CurrencyCode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const form = useForm<CardFormValues, unknown, CardInput>({
    resolver: zodResolver(cardInputSchema),
    defaultValues: { currency, kind: "credit", color: "#0f172a", isDefault: false },
  });

  const kind = form.watch("kind");

  function onSubmit(values: CardInput) {
    startTransition(async () => {
      const result = await createCardAction(values);
      if (!result.ok) {
        toast.error(result.error?.message ?? "No se pudo crear la tarjeta");
        return;
      }
      toast.success("Método de pago añadido");
      setOpen(false);
      form.reset();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          Añadir método
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo método de pago</DialogTitle>
          <DialogDescription>
            Solo se guardan los cuatro últimos dígitos. El número completo nunca se almacena.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" placeholder="Ej. Visa BCP" {...form.register("name")} />
            {form.formState.errors.name ? (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="kind">Tipo</Label>
              <Select
                value={kind}
                onValueChange={(value) => form.setValue("kind", value as CardKind)}
              >
                <SelectTrigger id="kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {CARD_KIND_LABELS[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="last4">Últimos 4 dígitos</Label>
              <Input
                id="last4"
                inputMode="numeric"
                maxLength={4}
                placeholder="4821"
                {...form.register("last4")}
              />
            </div>
          </div>

          {/* El ciclo solo aplica a crédito: pedirlo para efectivo sería ruido. */}
          {kind === "credit" ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="creditLimit">Límite</Label>
                <Input
                  id="creditLimit"
                  type="number"
                  step="0.01"
                  {...form.register("creditLimit", { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="statementDay">Día de corte</Label>
                <Input
                  id="statementDay"
                  type="number"
                  min="1"
                  max="31"
                  {...form.register("statementDay", { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dueDay">Día de pago</Label>
                <Input
                  id="dueDay"
                  type="number"
                  min="1"
                  max="31"
                  {...form.register("dueDay", { valueAsNumber: true })}
                />
              </div>
            </div>
          ) : null}

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Guardar
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
