import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { PeriodComparison } from "@/core/analytics";

interface KpiCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  comparison?: PeriodComparison;
  /** En gastos, subir es malo: invierte el color de la variación. */
  invertTrend?: boolean;
  hint?: string;
  children?: React.ReactNode;
}

/**
 * Indicador con comparación contra el período anterior.
 *
 * Un número solo no informa: "S/ 2,340" no dice nada; "S/ 2,340, 5% menos que
 * el mes pasado" sí. Por eso la comparación no es opcional en el diseño.
 */
export function KpiCard({
  label,
  value,
  icon: Icon,
  comparison,
  invertTrend = true,
  hint,
  children,
}: KpiCardProps) {
  const change = comparison?.change ?? null;
  const direction = comparison?.direction ?? "flat";

  const isBad = invertTrend ? direction === "up" : direction === "down";
  const isGood = invertTrend ? direction === "down" : direction === "up";

  const TrendIcon =
    direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus;

  return (
    <Card>
      <CardContent className="space-y-2.5 p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
        </div>

        <p className="tabular text-2xl font-semibold tracking-tight">{value}</p>

        {change !== null ? (
          <p
            className={cn(
              "flex items-center gap-1 text-xs font-medium",
              isBad && "text-destructive",
              isGood && "text-success",
              !isBad && !isGood && "text-muted-foreground",
            )}
          >
            <TrendIcon className="h-3.5 w-3.5" aria-hidden />
            <span className="tabular">
              {change > 0 ? "+" : ""}
              {change.toFixed(1)}%
            </span>
            <span className="font-normal text-muted-foreground">vs. período anterior</span>
          </p>
        ) : hint ? (
          <p className="text-xs text-muted-foreground">{hint}</p>
        ) : null}

        {children}
      </CardContent>
    </Card>
  );
}
