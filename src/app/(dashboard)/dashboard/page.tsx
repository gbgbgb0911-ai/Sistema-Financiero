import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  CalendarClock,
  Receipt,
  TrendingUp,
  Wallet,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import { requireUser, createServerSupabase } from "@/server/supabase/server";
import { getFormatContext } from "@/modules/profile/service";
import { getDashboardData } from "@/modules/dashboard/service";
import { formatMoney } from "@/core/money";
import { formatDate, toISODate } from "@/core/dates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/features/dashboard/KpiCard";
import { UpcomingPayments } from "@/components/features/dashboard/UpcomingPayments";
import { BudgetList } from "@/components/features/dashboard/BudgetList";
import { CashflowChart } from "@/components/charts/CashflowChart";
import { CategoryDonut } from "@/components/charts/CategoryDonut";
import { CardBars } from "@/components/charts/CardBars";
import { EXPENSE_SOURCE_LABELS } from "@/lib/constants";

export const metadata: Metadata = { title: "Resumen" };

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}

async function DashboardContent() {
  const user = await requireUser();
  const supabase = await createServerSupabase();
  const { timezone, currency, locale } = await getFormatContext(supabase, user.id);

  const data = await getDashboardData(supabase, user.id, timezone, "month");
  const money = (amount: number) => formatMoney(amount, currency, locale);
  const today = toISODate(new Date(), timezone);

  // Cuenta nueva: no tiene sentido mostrar cuatro gráficos vacíos.
  if (data.expenseCount === 0 && data.upcomingCount === 0) {
    return (
      <div className="mx-auto max-w-2xl py-12">
        <EmptyState
          icon={Wallet}
          title="Empieza a registrar tus gastos"
          description="Registra tu primer gasto y el resumen se irá construyendo solo: totales, categorías, tendencias y proyecciones."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link href="/gastos/nuevo">Registrar un gasto</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/pagos/nuevo">Programar un pago</Link>
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-in-view">
      {data.overdueCount > 0 ? (
        <Link
          href="/pagos"
          className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm transition-colors hover:bg-destructive/10"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
          <span className="flex-1">
            Tienes <strong>{data.overdueCount}</strong>{" "}
            {data.overdueCount === 1 ? "pago vencido" : "pagos vencidos"} sin registrar.
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </Link>
      ) : null}

      <section
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Indicadores financieros"
      >
        <KpiCard
          label="Hoy"
          value={money(data.today.current)}
          icon={Receipt}
          comparison={data.today}
        />
        <KpiCard
          label="Este mes"
          value={money(data.periodTotal.current)}
          icon={Wallet}
          comparison={data.periodTotal}
        />
        <KpiCard
          label="Por pagar (30 d)"
          value={money(data.upcomingTotal)}
          icon={CalendarClock}
          hint={`${data.upcomingCount} ${data.upcomingCount === 1 ? "vencimiento" : "vencimientos"}`}
        />
        <KpiCard
          label="Proyección de cierre"
          value={money(data.projectedTotal)}
          icon={TrendingUp}
          hint={`Al ritmo de ${money(data.dailyAverage)} por día`}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Flujo de gasto</CardTitle>
            <p className="text-xs text-muted-foreground">
              Barras: gasto diario. Línea discontinua: media de 7 días.
            </p>
          </CardHeader>
          <CardContent>
            <CashflowChart data={data.series} currency={currency} locale={locale} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">Próximos pagos</CardTitle>
            <Button asChild variant="ghost" size="sm" className="text-xs">
              <Link href="/calendario">Calendario</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <UpcomingPayments
              occurrences={data.upcomingPayments.map((o) => ({
                id: o.id,
                due_date: o.due_date,
                amount: Number(o.amount),
                currency: o.currency,
                payment: o.payment ? { name: o.payment.name } : null,
              }))}
              locale={locale}
              today={today}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Gastos por categoría</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryDonut data={data.byCategory} currency={currency} locale={locale} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Presupuestos</CardTitle>
          </CardHeader>
          <CardContent>
            <BudgetList budgets={data.budgets} currency={currency} locale={locale} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Por método de pago</CardTitle>
          </CardHeader>
          <CardContent>
            <CardBars data={data.byCard} currency={currency} locale={locale} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">Movimientos recientes</CardTitle>
            <Button asChild variant="ghost" size="sm" className="text-xs">
              <Link href="/gastos">Ver todos</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {data.recentExpenses.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Sin movimientos en el período
              </p>
            ) : (
              <ul className="divide-y divide-border/60">
                {data.recentExpenses.map((expense) => (
                  <li key={expense.id}>
                    <Link
                      href={`/gastos/${expense.id}`}
                      className="flex items-center gap-3 py-2.5 transition-colors hover:bg-accent/40"
                    >
                      <span
                        className="h-8 w-8 shrink-0 rounded-full"
                        style={{ background: `${expense.category?.color ?? "#94a3b8"}22` }}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {expense.merchant?.name ??
                            expense.merchant_raw ??
                            expense.description ??
                            "Sin comercio"}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {expense.category?.name ?? "Sin categoría"} ·{" "}
                          {formatDate(expense.occurred_at, timezone, locale, "datetime")}
                        </p>
                      </div>
                      {expense.source !== "manual" ? (
                        <Badge variant="muted" className="hidden sm:inline-flex">
                          {EXPENSE_SOURCE_LABELS[expense.source]}
                        </Badge>
                      ) : null}
                      <span className="tabular shrink-0 text-sm font-semibold">
                        {money(Number(expense.amount))}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {data.trends.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Mayores variaciones</CardTitle>
            <p className="text-xs text-muted-foreground">
              Ordenadas por importe, no por porcentaje: pasar de S/ 10 a S/ 20 es +100% pero
              irrelevante.
            </p>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {data.trends.map((trend) => (
                <li
                  key={trend.categoryId}
                  className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
                >
                  <span className="truncate">{trend.categoryName}</span>
                  <span
                    className={`tabular shrink-0 font-medium ${
                      trend.absoluteChange > 0 ? "text-destructive" : "text-success"
                    }`}
                  >
                    {trend.absoluteChange > 0 ? "+" : "−"}
                    {money(Math.abs(trend.absoluteChange))}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

/** Skeletons con la forma real del contenido, no un spinner genérico. */
function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[104px]" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-[320px] lg:col-span-2" />
        <Skeleton className="h-[320px]" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-[280px] lg:col-span-2" />
        <Skeleton className="h-[280px]" />
      </div>
    </div>
  );
}
