import type { Metadata } from "next";
import { CreditCard } from "lucide-react";
import { requireUser, createServerSupabase } from "@/server/supabase/server";
import { getFormatContext } from "@/modules/profile/service";
import { listCardsWithBalance } from "@/modules/cards/service";
import { formatMoney } from "@/core/money";
import { UTILIZATION_LABELS } from "@/core/statements";
import { CARD_KIND_LABELS } from "@/lib/constants";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { CardForm } from "@/components/features/cards/CardForm";

export const metadata: Metadata = { title: "Tarjetas" };

export default async function CardsPage() {
  const user = await requireUser();
  const supabase = await createServerSupabase();
  const { currency, locale } = await getFormatContext(supabase, user.id);

  const cards = await listCardsWithBalance(supabase, user.id);
  const money = (amount: number) => formatMoney(amount, currency, locale);

  return (
    <div className="space-y-4 animate-in-view">
      <div className="flex justify-end">
        <CardForm currency={currency} />
      </div>

      {cards.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="Sin métodos de pago"
          description="Registra tus tarjetas y cuentas para saber cuánto llevas consumido en cada ciclo de facturación."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map(({ card, currentBalance, cycle, utilization, minimumPayment }) => (
            <Card key={card.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{card.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {CARD_KIND_LABELS[card.kind]}
                      {card.last4 ? ` ·· ${card.last4}` : ""}
                    </p>
                  </div>
                  <span
                    className="h-8 w-12 shrink-0 rounded"
                    style={{ background: card.color }}
                    aria-hidden
                  />
                </div>

                <div>
                  <p className="text-xs text-muted-foreground">
                    {cycle ? "Consumido en el ciclo actual" : "Consumido este mes"}
                  </p>
                  <p className="tabular text-xl font-semibold">
                    {money(currentBalance)}
                  </p>
                </div>

                {utilization.percent !== null ? (
                  <div className="space-y-1">
                    <Progress
                      value={utilization.percent}
                      tone={
                        utilization.level === "critical"
                          ? "destructive"
                          : utilization.level === "high"
                            ? "warning"
                            : "success"
                      }
                      aria-label={`Utilización: ${utilization.percent.toFixed(0)}%`}
                    />
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {utilization.percent.toFixed(0)}% de{" "}
                        {money(Number(card.credit_limit ?? 0))}
                      </span>
                      <Badge
                        variant={
                          utilization.level === "critical"
                            ? "destructive"
                            : utilization.level === "high"
                              ? "warning"
                              : "success"
                        }
                      >
                        {UTILIZATION_LABELS[utilization.level]}
                      </Badge>
                    </div>
                  </div>
                ) : null}

                {cycle ? (
                  <div className="flex items-center justify-between border-t border-border pt-2 text-xs">
                    <span className="text-muted-foreground">
                      Vence el {cycle.dueDate.toISOString().slice(0, 10)}
                    </span>
                    <span
                      className={
                        cycle.daysUntilDue <= 3 ? "font-medium text-warning" : "text-muted-foreground"
                      }
                    >
                      {cycle.daysUntilDue >= 0
                        ? `en ${cycle.daysUntilDue} días`
                        : `hace ${Math.abs(cycle.daysUntilDue)} días`}
                    </span>
                  </div>
                ) : null}

                {card.kind === "credit" && currentBalance > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Pago mínimo estimado: {money(minimumPayment)}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
