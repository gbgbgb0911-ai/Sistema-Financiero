"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DailySeriesPoint } from "@/core/analytics";
import { formatMoney, type CurrencyCode } from "@/core/money";

interface CashflowChartProps {
  data: DailySeriesPoint[];
  currency: CurrencyCode;
  locale: string;
}

/**
 * Gasto diario con media móvil de 7 días.
 *
 * La media móvil es lo que hace legible el gráfico: el gasto diario suelto es
 * ruido (días con cero y picos de un pago grande), la tendencia sí informa.
 */
export function CashflowChart({ data, currency, locale }: CashflowChartProps) {
  const hasData = data.some((point) => point.total > 0);

  if (!hasData) {
    return (
      <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
        Sin movimientos en el período
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="cashflowFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.28} />
            <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
          </linearGradient>
        </defs>

        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />

        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickFormatter={(value: string) => value.slice(8)}
          minTickGap={24}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickFormatter={(value: number) =>
            formatMoney(Number(value), currency, locale, { compact: true, hideSymbol: true })
          }
          width={48}
        />

        <Tooltip
          cursor={{ stroke: "hsl(var(--border))" }}
          contentStyle={{
            background: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "var(--radius)",
            fontSize: 12,
          }}
          labelFormatter={(label) => `Día ${String(label)}`}
          formatter={(value, name) => [
            formatMoney(Number(value ?? 0), currency, locale),
            name === "total" ? "Gastado" : "Media 7 días",
          ]}
        />

        <Area
          type="monotone"
          dataKey="total"
          stroke="hsl(var(--chart-1))"
          strokeWidth={2}
          fill="url(#cashflowFill)"
          // La animación se ejecuta una vez al entrar, no en cada re-render.
          isAnimationActive
          animationDuration={600}
        />
        <Line
          type="monotone"
          dataKey="movingAverage"
          stroke="hsl(var(--chart-3))"
          strokeWidth={1.5}
          strokeDasharray="4 4"
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
