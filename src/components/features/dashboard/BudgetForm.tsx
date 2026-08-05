"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  budgetInputSchema,
  type BudgetInput,
  type BudgetFormValues,
} from "@/modules/categories/schema";
import { setBudgetAction } from "@/modules/categories/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { currencySymbol, type CurrencyCode } from "@/core/money";

export function BudgetForm({
  categories,
  currency,
}: {
  categories: Array<{ id: string; name: string }>;
  currency: CurrencyCode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const form = useForm<BudgetFormValues, unknown, BudgetInput>({
    resolver: zodResolver(budgetInputSchema),
    defaultValues: { currency, period: "monthly" },
  });

  function onSubmit(values: BudgetInput) {
    startTransition(async () => {
      const result = await setBudgetAction(values);
      if (!result.ok) {
        toast.error(result.error?.message ?? "No se pudo guardar el presupuesto");
        return;
      }
      toast.success("Presupuesto actualizado");
      form.reset({ currency, period: "monthly" });
      router.refresh();
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="budgetCategory">Categoría</Label>
        <Select
          value={form.watch("categoryId") ?? "global"}
          onValueChange={(value) =>
            form.setValue("categoryId", value === "global" ? null : value)
          }
        >
          <SelectTrigger id="budgetCategory">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="global">Todas (presupuesto global)</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="budgetAmount">Monto mensual</Label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {currencySymbol(currency)}
          </span>
          <Input
            id="budgetAmount"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            className="pl-9"
            {...form.register("amount", { valueAsNumber: true })}
          />
        </div>
        {form.formState.errors.amount ? (
          <p className="text-xs text-destructive">{form.formState.errors.amount.message}</p>
        ) : null}
      </div>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Guardar presupuesto
      </Button>
    </form>
  );
}
