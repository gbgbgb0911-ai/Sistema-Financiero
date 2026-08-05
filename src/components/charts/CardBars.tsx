"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { GroupTotal } from "@/core/analytics";
import { formatMoney, type CurrencyCode } from "@/core/money";
import { CHART_COLORS } from "@/lib/constants";

export function CardBars({
  data,
  currency,
  locale,
}: {
  data: GroupTotal[];
  currency: CurrencyCode;
  locale: string;
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-[180px] items-center justify-center text-sm text-muted-foreground">
        Sin movimientos por método de pago
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(140, data.length * 42)}>
      {/* Barras horizontales: los nombres de tarjeta son largos y en vertical
          se cortan o se rotan, que es peor para leer. */}
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="label"
          tickLine={false}
          axisLine={false}
          width={104}
          tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
        />
        <Tooltip
          cursor={{ fill: "hsl(var(--muted))" }}
          contentStyle={{
            background: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "var(--radius)",
            fontSize: 12,
          }}
          formatter={(value) => [formatMoney(Number(value ?? 0), currency, locale), "Gastado"]}
        />
        <Bar dataKey="total" radius={[0, 4, 4, 0]} animationDuration={600}>
          {data.map((entry, index) => (
            <Cell key={entry.key} fill={CHART_COLORS[index % CHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
