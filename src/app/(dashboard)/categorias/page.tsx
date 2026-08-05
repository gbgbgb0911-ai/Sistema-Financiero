import type { Metadata } from "next";
import { requireUser, createServerSupabase } from "@/server/supabase/server";
import { getFormatContext } from "@/modules/profile/service";
import { findCategories } from "@/modules/categories/repository";
import { getBudgetStatuses } from "@/modules/categories/service";
import { formatMoney } from "@/core/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { BudgetForm } from "@/components/features/dashboard/BudgetForm";

export const metadata: Metadata = { title: "Categorías" };

export default async function CategoriesPage() {
  const user = await requireUser();
  const supabase = await createServerSupabase();
  const { timezone, currency, locale } = await getFormatContext(supabase, user.id);

  const [categories, budgets] = await Promise.all([
    findCategories(supabase, user.id),
    getBudgetStatuses(supabase, user.id, timezone),
  ]);

  const money = (amount: number) => formatMoney(amount, currency, locale);
  const budgetByCategory = new Map(budgets.map((b) => [b.categoryId ?? "global", b]));

  return (
    <div className="grid gap-4 lg:grid-cols-3 animate-in-view">
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Categorías</CardTitle>
          <p className="text-xs text-muted-foreground">
            Cada categoría puede tener su propio presupuesto mensual. Sin presupuesto no hay
            referencia para saber si un gasto es excesivo.
          </p>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border/60">
            {categories.map((category) => {
              const budget = budgetByCategory.get(category.id);
              return (
                <li key={category.id} className="flex items-center gap-3 py-3">
                  <span
                    className="h-8 w-8 shrink-0 rounded-full"
                    style={{ background: `${category.color}22` }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{category.name}</p>
                    {budget ? (
                      <div className="mt-1 space-y-1">
                        <Progress
                          value={budget.percentUsed}
                          tone={
                            budget.level === "exceeded"
                              ? "destructive"
                              : budget.level === "warning"
                                ? "warning"
                                : "success"
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          {money(budget.spent)} de {money(budget.budget)} ·{" "}
                          {budget.percentUsed}%
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Sin presupuesto</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Definir presupuesto</CardTitle>
        </CardHeader>
        <CardContent>
          <BudgetForm
            categories={categories.map((c) => ({ id: c.id, name: c.name }))}
            currency={currency}
          />
        </CardContent>
      </Card>
    </div>
  );
}
