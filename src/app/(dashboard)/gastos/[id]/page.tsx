import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser, createServerSupabase } from "@/server/supabase/server";
import { getFormatContext } from "@/modules/profile/service";
import { findExpenseById } from "@/modules/expenses/repository";
import { findCategories } from "@/modules/categories/repository";
import { findCards } from "@/modules/cards/repository";
import { findMerchants } from "@/modules/merchants/repository";
import { ExpenseForm } from "@/components/features/expenses/ExpenseForm";
import { DeleteExpenseButton } from "@/components/features/expenses/DeleteExpenseButton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EXPENSE_SOURCE_LABELS } from "@/lib/constants";

export const metadata: Metadata = { title: "Detalle del gasto" };

export default async function ExpenseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const supabase = await createServerSupabase();

  const [{ currency }, expense, categories, cards, merchants] = await Promise.all([
    getFormatContext(supabase, user.id),
    findExpenseById(supabase, user.id, id),
    findCategories(supabase, user.id),
    findCards(supabase, user.id),
    findMerchants(supabase, user.id, { limit: 60 }),
  ]);

  if (!expense) notFound();

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="muted">{EXPENSE_SOURCE_LABELS[expense.source]}</Badge>
        {expense.status === "pending_review" ? (
          <Badge variant="warning">Pendiente de revisión</Badge>
        ) : null}
        {expense.status === "possible_duplicate" ? (
          <Badge variant="warning">Posible duplicado</Badge>
        ) : null}
        {expense.confidence !== null ? (
          <Badge variant="outline">
            Confianza {(Number(expense.confidence) * 100).toFixed(0)}%
          </Badge>
        ) : null}
      </div>

      <Card>
        <CardContent className="p-5 sm:p-6">
          <ExpenseForm
            expenseId={expense.id}
            categories={categories.map((c) => ({ id: c.id, name: c.name }))}
            cards={cards.map((c) => ({
              id: c.id,
              name: c.last4 ? `${c.name} ·${c.last4}` : c.name,
            }))}
            merchants={merchants.map((m) => ({ id: m.id, name: m.name }))}
            currency={currency}
            defaultValues={{
              amount: Number(expense.amount),
              currency: expense.currency,
              merchantName: expense.merchant?.name ?? expense.merchant_raw ?? "",
              categoryId: expense.category_id,
              cardId: expense.card_id,
              occurredAt: expense.occurred_at,
              notes: expense.notes ?? "",
            }}
          />
        </CardContent>
      </Card>

      <DeleteExpenseButton id={expense.id} />
    </div>
  );
}
