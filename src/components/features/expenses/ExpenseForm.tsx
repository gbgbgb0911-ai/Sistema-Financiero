"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  expenseInputSchema,
  type ExpenseInput,
  type ExpenseFormValues,
} from "@/modules/expenses/schema";
import { createExpenseAction, updateExpenseAction } from "@/modules/expenses/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { currencySymbol, type CurrencyCode } from "@/core/money";

interface Option {
  id: string;
  name: string;
}

interface ExpenseFormProps {
  categories: Option[];
  cards: Option[];
  merchants: Option[];
  currency: CurrencyCode;
  /** Presente al editar; ausente al crear. */
  expenseId?: string;
  defaultValues?: Partial<ExpenseFormValues>;
}

/**
 * Formulario de gasto.
 *
 * Los valores por defecto hacen casi todo el trabajo: fecha = ahora, moneda =
 * la del perfil. En el caso habitual solo hay que escribir el monto, elegir el
 * comercio y guardar.
 */
export function ExpenseForm({
  categories,
  cards,
  merchants,
  currency,
  expenseId,
  defaultValues,
}: ExpenseFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [merchantQuery, setMerchantQuery] = useState(defaultValues?.merchantName ?? "");

  const form = useForm<ExpenseFormValues, unknown, ExpenseInput>({
    resolver: zodResolver(expenseInputSchema),
    defaultValues: {
      currency,
      fxRate: 1,
      occurredAt: new Date().toISOString(),
      ...defaultValues,
    },
  });

  const suggestions = merchantQuery.length >= 2
    ? merchants
        .filter((m) => m.name.toLowerCase().includes(merchantQuery.toLowerCase()))
        .slice(0, 5)
    : [];

  function onSubmit(values: ExpenseInput) {
    startTransition(async () => {
      const result = expenseId
        ? await updateExpenseAction({ ...values, id: expenseId })
        : await createExpenseAction(values);

      if (!result.ok) {
        toast.error(result.error?.message ?? "No se pudo guardar el gasto");
        return;
      }

      const flagged =
        !expenseId &&
        typeof result.data === "object" &&
        result.data !== null &&
        "flaggedAsDuplicate" in result.data &&
        result.data.flaggedAsDuplicate;

      if (flagged) {
        toast.warning("Guardado, pero parece un duplicado", {
          description: "Hay otro gasto muy parecido cerca de esa hora. Revísalo en el historial.",
        });
      } else {
        toast.success(expenseId ? "Gasto actualizado" : "Gasto registrado");
      }

      router.push("/gastos");
      router.refresh();
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="amount">Monto</Label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {currencySymbol(currency)}
          </span>
          <Input
            id="amount"
            type="number"
            step="0.01"
            min="0"
            // autoFocus: es el primer campo que se rellena siempre.
            autoFocus
            inputMode="decimal"
            placeholder="0.00"
            className="pl-9 text-lg"
            {...form.register("amount", { valueAsNumber: true })}
          />
        </div>
        {form.formState.errors.amount ? (
          <p className="text-xs text-destructive">{form.formState.errors.amount.message}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="merchantName">Comercio</Label>
        <Input
          id="merchantName"
          placeholder="Ej. Plaza Vea, Netflix, gasolinera"
          autoComplete="off"
          {...form.register("merchantName", {
            onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
              setMerchantQuery(event.target.value),
          })}
        />
        {suggestions.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5 pt-1">
            {suggestions.map((merchant) => (
              <li key={merchant.id}>
                <button
                  type="button"
                  className="rounded-full border border-border px-2.5 py-1 text-xs transition-colors hover:bg-accent"
                  onClick={() => {
                    form.setValue("merchantName", merchant.name);
                    setMerchantQuery(merchant.name);
                  }}
                >
                  {merchant.name}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="categoryId">Categoría</Label>
          <Select
            value={form.watch("categoryId") ?? undefined}
            onValueChange={(value) => form.setValue("categoryId", value)}
          >
            <SelectTrigger id="categoryId">
              <SelectValue placeholder="Sugerida automáticamente" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="cardId">Método de pago</Label>
          <Select
            value={form.watch("cardId") ?? undefined}
            onValueChange={(value) => form.setValue("cardId", value)}
          >
            <SelectTrigger id="cardId">
              <SelectValue placeholder="Sin especificar" />
            </SelectTrigger>
            <SelectContent>
              {cards.map((card) => (
                <SelectItem key={card.id} value={card.id}>
                  {card.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="occurredAt">Fecha y hora</Label>
        <Input
          id="occurredAt"
          type="datetime-local"
          defaultValue={toDatetimeLocal(defaultValues?.occurredAt ?? new Date().toISOString())}
          onChange={(event) => {
            const value = event.target.value;
            if (value) form.setValue("occurredAt", new Date(value).toISOString());
          }}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notas</Label>
        <Textarea id="notes" placeholder="Opcional" {...form.register("notes")} />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending} className="flex-1 sm:flex-none">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {expenseId ? "Guardar cambios" : "Registrar gasto"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={pending}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

/** `datetime-local` necesita `YYYY-MM-DDTHH:mm` sin zona horaria. */
function toDatetimeLocal(iso: string): string {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
