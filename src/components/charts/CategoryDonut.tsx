"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { GroupTotal } from "@/core/analytics";
import { formatMoney, type CurrencyCode } from "@/core/money";
import { CHART_COLORS } from "@/lib/constants";

interface CategoryDonutProps {
  data: GroupTotal[];
  currency: CurrencyCode;
  locale: string;
}

export function CategoryDonut({ data, currency, locale }: CategoryDonutProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
        Sin datos para el período
      </div>
    );
  }

  // Más de seis segmentos se vuelve ilegible: el resto se agrupa en "Otros".
  const visible = data.slice(0, 6);
  const rest = data.slice(6);
  const chartData =
    rest.length > 0
      ? [
          ...visible,
          {
            key: "others",
            label: "Otros",
            total: rest.reduce((sum, item) => sum + item.total, 0),
            count: rest.reduce((sum, item) => sum + item.count, 0),
            percentage: rest.reduce((sum, item) => sum + item.percentage, 0),
          },
        ]
      : visible;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="h-[180px] w-full sm:w-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="total"
              nameKey="label"
              innerRadius={52}
              outerRadius={80}
              paddingAngle={2}
              strokeWidth={0}
              animationDuration={600}
            >
              {chartData.map((entry, index) => (
                <Cell key={entry.key} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "var(--radius)",
                fontSize: 12,
              }}
              formatter={(value) => formatMoney(Number(value ?? 0), currency, locale)}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* La leyenda es también la tabla accesible: cada dato tiene texto, no
          solo color, para no depender de la percepción cromática. */}
      <ul className="flex-1 space-y-2">
        {chartData.map((entry, index) => (
          <li key={entry.key} className="flex items-center gap-2.5 text-sm">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: CHART_COLORS[index % CHART_COLORS.length] }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate">{entry.label}</span>
            <span className="tabular text-muted-foreground">
              {entry.percentage.toFixed(0)}%
            </span>
            <span className="tabular w-20 text-right font-medium">
              {formatMoney(entry.total, currency, locale, { compact: true })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
