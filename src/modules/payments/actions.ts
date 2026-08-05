"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase, requireUser } from "@/server/supabase/server";
import { failure, success, type ActionResult } from "@/core/errors";
import { paymentInputSchema, paymentUpdateSchema, occurrenceActionSchema } from "./schema";
import * as service from "./service";

export async function createPaymentAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const input = paymentInputSchema.parse(raw);
    const supabase = await createServerSupabase();

    const payment = await service.createPayment(supabase, user.id, input);

    revalidatePath("/pagos");
    revalidatePath("/calendario");
    revalidatePath("/dashboard");

    return success({ id: payment.id });
  } catch (error) {
    return failure(error);
  }
}

export async function updatePaymentAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const input = paymentUpdateSchema.parse(raw);
    const supabase = await createServerSupabase();

    const payment = await service.updatePaymentById(supabase, user.id, input);

    revalidatePath("/pagos");
    revalidatePath(`/pagos/${input.id}`);
    revalidatePath("/calendario");

    return success({ id: payment.id });
  } catch (error) {
    return failure(error);
  }
}

export async function deactivatePaymentAction(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const supabase = await createServerSupabase();

    await service.deactivatePayment(supabase, user.id, id);

    revalidatePath("/pagos");
    revalidatePath("/calendario");

    return success(undefined);
  } catch (error) {
    return failure(error);
  }
}

export async function occurrenceActionHandler(
  raw: unknown,
): Promise<ActionResult<{ message: string }>> {
  try {
    const user = await requireUser();
    const input = occurrenceActionSchema.parse(raw);
    const supabase = await createServerSupabase();

    const result = await service.applyOccurrenceAction(supabase, user.id, input);

    revalidatePath("/pagos");
    revalidatePath("/calendario");
    revalidatePath("/dashboard");
    revalidatePath("/gastos");

    return success({ message: result.message });
  } catch (error) {
    return failure(error);
  }
}
