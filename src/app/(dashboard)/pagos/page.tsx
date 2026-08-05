import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CalendarClock, Plus } from "lucide-react";
import { requireUser, createServerSupabase } from "@/server/supabase/server";
import { getFormatContext } from "@/modules/profile/service";
import { listPayments, getUpcoming, getOverdue } from "@/modules/payments/service";
import { formatMoney } from "@/core/money";
import { describeRecurrence } from "@/core/recurrence";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PaymentActions } from "@/components/features/payments/PaymentActions";

export const metadata: Metadata = { title: "Pagos" };

export default async function PaymentsPage() {
  const user = await requireUser();
  const supabase = await createServerSupabase();
  const { currency, locale } = await getFormatContext(supabase, user.id);

  const [payments, upcoming, overdue] = await Promise.all([
    listPayments(supabase, user.id),
    getUpcoming(supabase, user.id, 45),
    getOverdue(supabase, user.id),
  ]);

  const money = (amount: number) => formatMoney(amount, currency, locale);

  if (payments.length === 0) {
    return (
      <div className="mx-auto max-w-2xl py-12">
        <EmptyState
          icon={CalendarClock}
          title="Sin pagos programados"
          description="Programa tus pagos recurrentes (alquiler, servicios, suscripciones) y te avisaré por WhatsApp un día antes y el mismo día del vencimiento."
          action={
            <Button asChild>
              <Link href="/pagos/nuevo">Programar un pago</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in-view">
      <div className="flex justify-end">
        <Button asChild size="sm">
          <Link href="/pagos/nuevo">
            <Plus className="h-4 w-4" />
            Nuevo pago
          </Link>
        </Button>
      </div>

      {overdue.length > 0 ? (
        <Card className="border-destructive/30">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Vencidos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border/60">
              {overdue.map((occurrence) => (
                <li key={occurrence.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {occurrence.payment?.name ?? "Pago"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Venció el {occurrence.due_date}
                    </p>
                  </div>
                  <span className="tabular text-sm font-semibold">
                    {money(Number(occurrence.amount))}
                  </span>
                  <PaymentActions occurrenceId={occurrence.id} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Próximos 45 días</CardTitle>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Sin vencimientos en el horizonte
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {upcoming.map((occurrence) => (
                <li key={occurrence.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {occurrence.payment?.name ?? "Pago"}
                    </p>
                    <p className="text-xs text-muted-foreground">Vence el {occurrence.due_date}</p>
                  </div>
                  <span className="tabular text-sm font-semibold">
                    {money(Number(occurrence.amount))}
                  </span>
                  <PaymentActions occurrenceId={occurrence.id} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Pagos configurados</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border/60">
            {payments.map((payment) => (
              <li key={payment.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{payment.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {describeRecurrence(
                      {
                        frequency: payment.frequency,
                        anchorDate: payment.anchor_date,
                        endDate: payment.end_date,
                      },
                      locale,
                    )}
                    {payment.category ? ` · ${payment.category.name}` : ""}
                  </p>
                </div>
                {payment.auto_create_expense ? (
                  <Badge variant="muted" className="hidden sm:inline-flex">
                    Crea gasto
                  </Badge>
                ) : null}
                <span className="tabular text-sm font-semibold">
                  {money(Number(payment.amount))}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
