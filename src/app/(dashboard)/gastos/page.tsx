import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Plus, Receipt } from "lucide-react";
import { requireUser, createServerSupabase } from "@/server/supabase/server";
import { getFormatContext } from "@/modules/profile/service";
import { listExpenses } from "@/modules/expenses/service";
import { findCategories } from "@/modules/categories/repository";
import { findCards } from "@/modules/cards/repository";
import { resolvePeriod, type PeriodKey } from "@/core/dates";
import { formatMoney } from "@/core/money";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ExpenseTable } from "@/components/features/expenses/ExpenseTable";
import { ExpenseFilters } from "@/components/features/expenses/ExpenseFilters";

export const metadata: Metadata = { title: "Gastos" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function ExpensesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <ExpensesContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ExpensesContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const user = await requireUser();
  const supabase = await createServerSupabase();
  const { timezone, currency, locale } = await getFormatContext(supabase, user.id);

  const period = (asString(params.period) ?? "month") as PeriodKey;
  const { current } = resolvePeriod(period, timezone);

  const categoryId = asString(params.category);
  const cardId = asString(params.card);

  const [{ items }, categories, cards] = await Promise.all([
    listExpenses(supabase, user.id, {
      search: asString(params.q),
      from: current.from.toISOString(),
      to: current.to.toISOString(),
      categoryIds: categoryId ? [categoryId] : undefined,
      cardIds: cardId ? [cardId] : undefined,
      limit: 100,
      sortBy: "date",
      sortDir: "desc",
    }),
    findCategories(supabase, user.id),
    findCards(supabase, user.id),
  ]);

  const total = items.reduce((sum, expense) => sum + Number(expense.amount), 0);

  return (
    <div className="space-y-4 animate-in-view">
      <ExpenseFilters
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        cards={cards.map((c) => ({ id: c.id, name: c.name }))}
      />

      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {items.length} {items.length === 1 ? "movimiento" : "movimientos"} ·{" "}
          <span className="tabular font-medium text-foreground">
            {formatMoney(total, currency, locale)}
          </span>
        </p>
        <Button asChild size="sm" className="lg:hidden">
          <Link href="/gastos/nuevo">
            <Plus className="h-4 w-4" />
            Nuevo
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-0 sm:p-2">
          {items.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="Sin movimientos"
              description="No hay gastos que coincidan con los filtros aplicados. Prueba a ampliar el período o a limpiar la búsqueda."
              action={
                <Button asChild size="sm">
                  <Link href="/gastos/nuevo">Registrar un gasto</Link>
                </Button>
              }
              className="border-0"
            />
          ) : (
            <div className="px-3 sm:px-1">
              <ExpenseTable
                expenses={items}
                currency={currency}
                locale={locale}
                timezone={timezone}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function asString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value || undefined;
}

function ListSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-[500px] w-full" />
    </div>
  );
}
