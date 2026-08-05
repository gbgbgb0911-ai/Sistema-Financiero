"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase, requireUser } from "@/server/supabase/server";
import { failure, success, type ActionResult } from "@/core/errors";
import { expenseInputSchema, expenseUpdateSchema } from "./schema";
import * as service from "./service";

/**
 * Server Actions: la frontera entre la interfaz y el dominio.
 *
 * Cada una valida su entrada con el mismo esquema Zod que usa el formulario,
 * de modo que un cliente manipulado no puede saltarse las reglas.
 */

export async function createExpenseAction(
  raw: unknown,
): Promise<ActionResult<{ id: string; flaggedAsDuplicate: boolean }>> {
  try {
    const user = await requireUser();
    const input = expenseInputSchema.parse(raw);
    const supabase = await createServerSupabase();

    const result = await service.createExpense(supabase, user.id, input, {
      source: "manual",
    });

    revalidatePath("/dashboard");
    revalidatePath("/gastos");

    return success({
      id: result.expense.id,
      flaggedAsDuplicate: result.flaggedAsDuplicate,
    });
  } catch (error) {
    return failure(error);
  }
}

export async function updateExpenseAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const input = expenseUpdateSchema.parse(raw);
    const supabase = await createServerSupabase();

    const expense = await service.updateExpenseById(supabase, user.id, input);

    revalidatePath("/dashboard");
    revalidatePath("/gastos");
    revalidatePath(`/gastos/${input.id}`);

    return success({ id: expense.id });
  } catch (error) {
    return failure(error);
  }
}

export async function deleteExpenseAction(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const supabase = await createServerSupabase();

    await service.deleteExpense(supabase, user.id, id);

    revalidatePath("/dashboard");
    revalidatePath("/gastos");

    return success(undefined);
  } catch (error) {
    return failure(error);
  }
}

export async function confirmExpenseAction(
  id: string,
  categoryId?: string | null,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const supabase = await createServerSupabase();

    await service.confirmExpense(supabase, user.id, id, categoryId);

    revalidatePath("/dashboard");
    revalidatePath("/gastos");

    return success(undefined);
  } catch (error) {
    return failure(error);
  }
}
