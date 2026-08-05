"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  paymentInputSchema,
  type PaymentInput,
  type PaymentFormValues,
} from "@/modules/payments/schema";
import { createPaymentAction } from "@/modules/payments/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { currencySymbol, type CurrencyCode } from "@/core/money";
import { FREQUENCY_LABELS, type Frequency } from "@/core/recurrence";

const FREQUENCIES: Frequency[] = ["once", "weekly", "biweekly", "monthly", "quarterly", "yearly"];

export function PaymentForm({
  categories,
  cards,
  currency,
}: {
  categories: Array<{ id: string; name: string }>;
  cards: Array<{ id: string; name: string }>;
  currency: CurrencyCode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const form = useForm<PaymentFormValues, unknown, PaymentInput>({
    resolver: zodResolver(paymentInputSchema),
    defaultValues: {
      currency,
      frequency: "monthly",
      anchorDate: new Date().toISOString().slice(0, 10),
      reminderDays: [1, 0],
      autoCreateExpense: true,
    },
  });

  function onSubmit(values: PaymentInput) {
    startTransition(async () => {
      const result = await createPaymentAction(values);
      if (!result.ok) {
        toast.error(result.error?.message ?? "No se pudo crear el pago");
        return;
      }
      toast.success("Pago programado");
      router.push("/pagos");
      router.refresh();
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="name">Nombre del pago</Label>
        <Input id="name" autoFocus placeholder="Ej. Netflix, alquiler, internet" {...form.register("name")} />
        {form.formState.errors.name ? (
          <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
        ) : null}
      </div>

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
            inputMode="decimal"
            placeholder="0.00"
            className="pl-9"
            {...form.register("amount", { valueAsNumber: true })}
          />
        </div>
        {form.formState.errors.amount ? (
          <p className="text-xs text-destructive">{form.formState.errors.amount.message}</p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="frequency">Frecuencia</Label>
          <Select
            value={form.watch("frequency")}
            onValueChange={(value) => form.setValue("frequency", value as Frequency)}
          >
            <SelectTrigger id="frequency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FREQUENCIES.map((frequency) => (
                <SelectItem key={frequency} value={frequency}>
                  {FREQUENCY_LABELS[frequency]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="anchorDate">Primer vencimiento</Label>
          <Input id="anchorDate" type="date" {...form.register("anchorDate")} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="categoryId">Categoría</Label>
          <Select
            value={form.watch("categoryId") ?? undefined}
            onValueChange={(value) => form.setValue("categoryId", value)}
          >
            <SelectTrigger id="categoryId">
              <SelectValue placeholder="Sin categoría" />
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

      <div className="flex items-start gap-3 rounded-lg border border-border p-3">
        <Switch
          id="autoCreateExpense"
          checked={form.watch("autoCreateExpense")}
          onCheckedChange={(checked) => form.setValue("autoCreateExpense", checked)}
        />
        <div className="space-y-0.5">
          <Label htmlFor="autoCreateExpense">Registrar el gasto al marcarlo como pagado</Label>
          <p className="text-xs text-muted-foreground">
            Así el pago cuenta en tus totales sin tener que anotarlo dos veces.
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notas</Label>
        <Textarea id="notes" placeholder="Opcional" {...form.register("notes")} />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Programar pago
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={pending}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
