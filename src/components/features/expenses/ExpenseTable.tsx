"use client";

import Link from "next/link";
import { Mail, MessageCircle, Repeat, Upload, Hand } from "lucide-react";
import type { ExpenseWithRelations } from "@/modules/expenses/repository";
import { formatMoney, type CurrencyCode } from "@/core/money";
import { formatDate } from "@/core/dates";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const SOURCE_ICON = {
  manual: Hand,
  email: Mail,
  whatsapp: MessageCircle,
  import: Upload,
  recurring: Repeat,
} as const;

const SOURCE_LABEL = {
  manual: "Registrado a mano",
  email: "Detectado en un correo",
  whatsapp: "Registrado por WhatsApp",
  import: "Importado",
  recurring: "Generado por un pago recurrente",
} as const;

interface ExpenseTableProps {
  expenses: ExpenseWithRelations[];
  currency: CurrencyCode;
  locale: string;
  timezone: string;
}

/**
 * Historial de gastos.
 *
 * En móvil no hay scroll horizontal: la tabla se convierte en una lista de
 * tarjetas. Esconder columnas de importes tras un scroll lateral es la peor
 * opción en datos financieros.
 */
export function ExpenseTable({ expenses, currency, locale, timezone }: ExpenseTableProps) {
  return (
    <>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Comercio</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Método</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead className="text-right">Monto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses.map((expense) => {
              const Icon = SOURCE_ICON[expense.source];
              return (
                <TableRow key={expense.id} className="cursor-pointer">
                  <TableCell>
                    <Link href={`/gastos/${expense.id}`} className="flex items-center gap-2">
                      <Icon
                        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                        aria-label={SOURCE_LABEL[expense.source]}
                      />
                      <span className="truncate font-medium">
                        {expense.merchant?.name ??
                          expense.merchant_raw ??
                          expense.description ??
                          "Sin comercio"}
                      </span>
                      {expense.status === "possible_duplicate" ? (
                        <Badge variant="warning">Duplicado</Badge>
                      ) : null}
                      {expense.status === "pending_review" ? (
                        <Badge variant="warning">Revisar</Badge>
                      ) : null}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {expense.category ? (
                      <span className="inline-flex items-center gap-1.5 text-sm">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: expense.category.color }}
                          aria-hidden
                        />
                        {expense.category.name}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">Sin categoría</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {expense.card?.name ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {formatDate(expense.occurred_at, timezone, locale, "datetime")}
                  </TableCell>
                  <TableCell className="tabular text-right font-semibold">
                    {formatMoney(Number(expense.amount), expense.currency, locale)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <ul className="divide-y divide-border md:hidden">
        {expenses.map((expense) => {
          const Icon = SOURCE_ICON[expense.source];
          return (
            <li key={expense.id}>
              <Link
                href={`/gastos/${expense.id}`}
                className="flex items-center gap-3 py-3 transition-colors active:bg-accent/40"
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                  style={{ background: `${expense.category?.color ?? "#94a3b8"}22` }}
                >
                  <Icon
                    className="h-4 w-4 text-muted-foreground"
                    aria-label={SOURCE_LABEL[expense.source]}
                  />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {expense.merchant?.name ??
                      expense.merchant_raw ??
                      expense.description ??
                      "Sin comercio"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {expense.category?.name ?? "Sin categoría"} ·{" "}
                    {formatDate(expense.occurred_at, timezone, locale, "short")}
                  </p>
                </div>

                <span className="tabular shrink-0 text-sm font-semibold">
                  {formatMoney(Number(expense.amount), expense.currency, locale)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
