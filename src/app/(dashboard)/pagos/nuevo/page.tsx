import type { Metadata } from "next";
import { requireUser, createServerSupabase } from "@/server/supabase/server";
import { getFormatContext } from "@/modules/profile/service";
import { findCategories } from "@/modules/categories/repository";
import { findCards } from "@/modules/cards/repository";
import { PaymentForm } from "@/components/features/payments/PaymentForm";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Nuevo pago" };

export default async function NewPaymentPage() {
  const user = await requireUser();
  const supabase = await createServerSupabase();

  const [{ currency }, categories, cards] = await Promise.all([
    getFormatContext(supabase, user.id),
    findCategories(supabase, user.id),
    findCards(supabase, user.id),
  ]);

  return (
    <div className="mx-auto max-w-xl">
      <Card>
        <CardContent className="p-5 sm:p-6">
          <PaymentForm
            categories={categories.map((c) => ({ id: c.id, name: c.name }))}
            cards={cards.map((c) => ({
              id: c.id,
              name: c.last4 ? `${c.name} ·${c.last4}` : c.name,
            }))}
            currency={currency}
          />
        </CardContent>
      </Card>
    </div>
  );
}
