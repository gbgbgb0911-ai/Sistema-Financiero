import { Target } from "lucide-react";
import type { BudgetStatus } from "@/core/analytics";
import { formatMoney, type CurrencyCode } from "@/core/money";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export function BudgetList({
  budgets,
  currency,
  locale,
}: {
  budgets: BudgetStatus[];
  currency: CurrencyCode;
  locale: string;
}) {
  if (budgets.length === 0) {
    return (
      <EmptyState
        icon={Target}
        title="Sin presupuestos"
        description="Un presupuesto es la referencia contra la que se mide si un gasto es excesivo. Sin él, solo hay cifras sueltas."
        action={
          <Button asChild size="sm" variant="outline">
            <Link href="/categorias">Definir presupuesto</Link>
          </Button>
        }
        className="border-0 py-8"
      />
    );
  }

  return (
    <ul className="space-y-4">
      {budgets.slice(0, 5).map((budget) => (
        <li key={`${budget.categoryId ?? "global"}-${budget.categoryName}`} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate font-medium">{budget.categoryName}</span>
            <span className="tabular shrink-0 text-xs text-muted-foreground">
              {formatMoney(budget.spent, currency, locale)} de{" "}
              {formatMoney(budget.budget, currency, locale)}
            </span>
          </div>

          <Progress
            value={budget.percentUsed}
            tone={
              budget.level === "exceeded"
                ? "destructive"
                : budget.level === "warning"
                  ? "warning"
                  : "success"
            }
            aria-label={`${budget.categoryName}: ${budget.percentUsed}% del presupuesto usado`}
          />

          {/* El estado va también en texto, no solo en el color de la barra. */}
          <p className="text-xs text-muted-foreground">
            {budget.level === "exceeded"
              ? `Excedido en ${formatMoney(Math.abs(budget.remaining), currency, locale)}`
              : budget.dailyAllowance !== null
                ? `Quedan ${formatMoney(budget.remaining, currency, locale)} · ${formatMoney(budget.dailyAllowance, currency, locale)} por día`
                : `Quedan ${formatMoney(budget.remaining, currency, locale)}`}
          </p>
        </li>
      ))}
    </ul>
  );
}
