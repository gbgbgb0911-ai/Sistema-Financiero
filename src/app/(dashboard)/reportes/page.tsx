import type { Metadata } from "next";
import { FileBarChart } from "lucide-react";
import { requireUser, createServerSupabase } from "@/server/supabase/server";
import { getProfile } from "@/modules/profile/service";
import { buildReport } from "@/modules/reports/service";
import { getSubscriptions } from "@/modules/dashboard/service";
import { formatMoney } from "@/core/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { ReportKind } from "@/types/database";

export const metadata: Metadata = { title: "Reportes" };

const KINDS: Array<{ kind: ReportKind; label: string }> = [
  { kind: "daily", label: "Diario" },
  { kind: "weekly", label: "Semanal" },
  { kind: "monthly", label: "Mensual" },
];

export default async function ReportsPage() {
  const user = await requireUser();
  const supabase = await createServerSupabase();
  const profile = await getProfile(supabase, user.id);

  const [daily, weekly, monthly, subscriptions] = await Promise.all([
    buildReport(supabase, profile, "daily"),
    buildReport(supabase, profile, "weekly"),
    buildReport(supabase, profile, "monthly"),
    getSubscriptions(supabase, user.id),
  ]);

  const reports = { daily, weekly, monthly };
  const money = (amount: number) =>
    formatMoney(amount, profile.base_currency, profile.locale);

  return (
    <div className="space-y-4 animate-in-view">
      <Tabs defaultValue="monthly">
        <TabsList>
          {KINDS.map(({ kind, label }) => (
            <TabsTrigger key={kind} value={kind}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        {KINDS.map(({ kind }) => {
          const report = reports[kind];
          return (
            <TabsContent key={kind} value={kind} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Total gastado
                    </p>
                    <p className="tabular text-2xl font-semibold">{money(report.total)}</p>
                    <p className="text-xs text-muted-foreground">
                      {report.expenseCount}{" "}
                      {report.expenseCount === 1 ? "movimiento" : "movimientos"}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Período anterior
                    </p>
                    <p className="tabular text-2xl font-semibold">
                      {money(report.previousTotal)}
                    </p>
                    <p
                      className={`text-xs ${
                        (report.changePercent ?? 0) > 0 ? "text-destructive" : "text-success"
                      }`}
                    >
                      {report.changePercent !== null
                        ? `${report.changePercent > 0 ? "+" : ""}${report.changePercent.toFixed(1)}%`
                        : "Sin comparación"}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Por pagar (30 d)
                    </p>
                    <p className="tabular text-2xl font-semibold">
                      {money(report.upcomingTotal)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Por categoría</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {report.byCategory.length === 0 ? (
                      <p className="py-4 text-sm text-muted-foreground">Sin datos</p>
                    ) : (
                      <ul className="space-y-2">
                        {report.byCategory.map((category) => (
                          <li
                            key={category.label}
                            className="flex items-center justify-between text-sm"
                          >
                            <span className="truncate">{category.label}</span>
                            <span className="tabular shrink-0 font-medium">
                              {money(category.total)}{" "}
                              <span className="font-normal text-muted-foreground">
                                ({category.percentage}%)
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Principales comercios</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {report.topMerchants.length === 0 ? (
                      <p className="py-4 text-sm text-muted-foreground">Sin datos</p>
                    ) : (
                      <ul className="space-y-2">
                        {report.topMerchants.map((merchant) => (
                          <li
                            key={merchant.label}
                            className="flex items-center justify-between text-sm"
                          >
                            <span className="truncate">{merchant.label}</span>
                            <span className="tabular shrink-0 font-medium">
                              {money(merchant.total)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </div>

              {report.budgetsExceeded.length > 0 ? (
                <Card className="border-destructive/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base text-destructive">
                      Presupuestos excedidos
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {report.budgetsExceeded.map((budget) => (
                        <li
                          key={budget.categoryName}
                          className="flex items-center justify-between text-sm"
                        >
                          <span>{budget.categoryName}</span>
                          <span className="tabular font-medium">
                            {money(budget.spent)} de {money(budget.budget)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ) : null}
            </TabsContent>
          );
        })}
      </Tabs>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Suscripciones detectadas</CardTitle>
          <p className="text-xs text-muted-foreground">
            Cargos recurrentes del mismo comercio con importe estable en los últimos 6 meses.
          </p>
        </CardHeader>
        <CardContent>
          {subscriptions.length === 0 ? (
            <EmptyState
              icon={FileBarChart}
              title="Sin suscripciones detectadas"
              description="Hacen falta al menos tres cargos regulares del mismo comercio para identificar un patrón."
              className="border-0 py-6"
            />
          ) : (
            <ul className="divide-y divide-border/60">
              {subscriptions.map((subscription) => (
                <li key={subscription.merchantId} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{subscription.merchantName}</p>
                    <p className="text-xs text-muted-foreground">
                      Cada ~{subscription.averageIntervalDays} días ·{" "}
                      {subscription.occurrences} cargos
                    </p>
                  </div>
                  {/* Muchos días sin cobro es la señal de una suscripción olvidada. */}
                  {subscription.daysSinceLastCharge > subscription.averageIntervalDays * 1.5 ? (
                    <Badge variant="warning">Sin cargo reciente</Badge>
                  ) : null}
                  <span className="tabular shrink-0 text-sm font-semibold">
                    {money(subscription.monthlyEstimate)}
                    <span className="font-normal text-muted-foreground">/mes</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
