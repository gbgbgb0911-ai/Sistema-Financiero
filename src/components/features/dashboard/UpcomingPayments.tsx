import Link from "next/link";
import { AlertTriangle, CalendarClock, CircleDot } from "lucide-react";
import { formatMoney, type CurrencyCode } from "@/core/money";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Occurrence {
  id: string;
  due_date: string;
  amount: number;
  currency: CurrencyCode;
  payment: { name: string } | null;
}

export function UpcomingPayments({
  occurrences,
  locale,
  today,
}: {
  occurrences: Occurrence[];
  locale: string;
  today: string;
}) {
  if (occurrences.length === 0) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="Sin pagos próximos"
        description="Cuando programes un pago recurrente aparecerá aquí con su vencimiento."
        className="border-0 py-8"
      />
    );
  }

  return (
    <ul className="divide-y divide-border/60">
      {occurrences.map((occurrence) => {
        const overdue = occurrence.due_date < today;
        const dueToday = occurrence.due_date === today;

        return (
          <li key={occurrence.id}>
            <Link
              href="/pagos"
              className="flex items-center gap-3 py-2.5 transition-colors hover:bg-accent/40"
            >
              {overdue ? (
                <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
              ) : (
                <CircleDot
                  className={cn(
                    "h-4 w-4 shrink-0",
                    dueToday ? "text-warning" : "text-muted-foreground",
                  )}
                  aria-hidden
                />
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {occurrence.payment?.name ?? "Pago"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {overdue ? "Venció el " : "Vence el "}
                  {occurrence.due_date}
                </p>
              </div>

              {overdue ? (
                <Badge variant="destructive">Vencido</Badge>
              ) : dueToday ? (
                <Badge variant="warning">Hoy</Badge>
              ) : null}

              <span className="tabular text-sm font-semibold">
                {formatMoney(Number(occurrence.amount), occurrence.currency, locale)}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
