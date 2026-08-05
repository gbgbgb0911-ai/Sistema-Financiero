import type { Metadata } from "next";
import { requireUser, createServerSupabase } from "@/server/supabase/server";
import { getFormatContext } from "@/modules/profile/service";
import { findCategories } from "@/modules/categories/repository";
import { findCards } from "@/modules/cards/repository";
import { findMerchants } from "@/modules/merchants/repository";
import { ExpenseForm } from "@/components/features/expenses/ExpenseForm";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Nuevo gasto" };

export default async function NewExpensePage() {
  const user = await requireUser();
  const supabase = await createServerSupabase();

  const [{ currency }, categories, cards, merchants] = await Promise.all([
    getFormatContext(supabase, user.id),
    findCategories(supabase, user.id),
    findCards(supabase, user.id),
    findMerchants(supabase, user.id, { limit: 60 }),
  ]);

  const defaultCard = cards.find((card) => card.is_default);

  return (
    <div className="mx-auto max-w-xl">
      <Card>
        <CardContent className="p-5 sm:p-6">
          <ExpenseForm
            categories={categories.map((c) => ({ id: c.id, name: c.name }))}
            cards={cards.map((c) => ({
              id: c.id,
              name: c.last4 ? `${c.name} ·${c.last4}` : c.name,
            }))}
            merchants={merchants.map((m) => ({ id: m.id, name: m.name }))}
            currency={currency}
            // La última tarjeta usada es casi siempre la correcta: ahorra un toque.
            defaultValues={{ cardId: defaultCard?.id ?? null }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
