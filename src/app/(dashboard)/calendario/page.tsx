import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";
import { requireUser, createServerSupabase } from "@/server/supabase/server";
import { getFormatContext } from "@/modules/profile/service";
import { findUpcomingOccurrences } from "@/modules/payments/repository";
import { formatMoney } from "@/core/money";
import { zonedNow, toISODate, daysInMonth } from "@/core/dates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Calendario" };

export default async function CalendarPage() {
  const user = await requireUser();
  const supabase = await createServerSupabase();
  const { timezone, currency, locale } = await getFormatContext(supabase, user.id);

  const now = zonedNow(timezone);
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const today = toISODate(new Date(), timezone);

  const firstDay = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const totalDays = daysInMonth(year, month);
  const lastDay = `${year}-${String(month + 1).padStart(2, "0")}-${totalDays}`;

  const occurrences = await findUpcomingOccurrences(supabase, user.id, {
    from: firstDay,
    to: lastDay,
    limit: 200,
    statuses: ["pending", "overdue", "paid"],
  });

  // Agrupación por día: el calendario solo necesita saber qué cae en cada casilla.
  const byDay = new Map<string, typeof occurrences>();
  for (const occurrence of occurrences) {
    const list = byDay.get(occurrence.due_date) ?? [];
    list.push(occurrence);
    byDay.set(occurrence.due_date, list);
  }

  const monthName = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month, 1)));

  // Lunes como primer día: es la convención en español.
  const firstWeekday = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
  const cells = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: totalDays }, (_, index) => index + 1),
  ];

  const total = occurrences.reduce((sum, o) => sum + Number(o.amount), 0);

  return (
    <div className="space-y-4 animate-in-view">
      <Card>
        <CardHeader className="flex-row items-baseline justify-between space-y-0 pb-3">
          <CardTitle className="text-base capitalize">{monthName}</CardTitle>
          <span className="tabular text-sm text-muted-foreground">
            {formatMoney(total, currency, locale)} en {occurrences.length} vencimientos
          </span>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day) => (
              <div key={day} className="py-1.5">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, index) => {
              if (day === null) return <div key={`empty-${index}`} className="min-h-16" />;

              const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const dayOccurrences = byDay.get(iso) ?? [];
              const isToday = iso === today;
              const hasOverdue = dayOccurrences.some(
                (o) => o.status !== "paid" && iso < today,
              );

              return (
                <div
                  key={iso}
                  className={cn(
                    "min-h-16 rounded-md border p-1.5 text-left transition-colors",
                    isToday ? "border-primary bg-primary/5" : "border-border",
                    hasOverdue && "border-destructive/40 bg-destructive/5",
                  )}
                >
                  <span
                    className={cn(
                      "tabular text-xs",
                      isToday ? "font-semibold text-primary" : "text-muted-foreground",
                    )}
                  >
                    {day}
                  </span>

                  <ul className="mt-0.5 space-y-0.5">
                    {dayOccurrences.slice(0, 2).map((occurrence) => (
                      <li
                        key={occurrence.id}
                        className={cn(
                          "truncate rounded px-1 py-0.5 text-[10px] leading-tight",
                          occurrence.status === "paid"
                            ? "bg-success/15 text-success line-through"
                            : "bg-primary/10 text-primary",
                        )}
                        title={`${occurrence.payment?.name ?? "Pago"} · ${formatMoney(Number(occurrence.amount), occurrence.currency, locale)}`}
                      >
                        {occurrence.payment?.name ?? "Pago"}
                      </li>
                    ))}
                    {dayOccurrences.length > 2 ? (
                      <li className="px-1 text-[10px] text-muted-foreground">
                        +{dayOccurrences.length - 2} más
                      </li>
                    ) : null}
                  </ul>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {occurrences.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Sin vencimientos este mes"
          description="Los pagos que programes aparecerán aquí en su fecha correspondiente."
        />
      ) : null}
    </div>
  );
}
