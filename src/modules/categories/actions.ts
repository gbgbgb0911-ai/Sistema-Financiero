"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase, requireUser } from "@/server/supabase/server";
import { failure, success, type ActionResult } from "@/core/errors";
import { categoryInputSchema, categoryUpdateSchema, budgetInputSchema } from "./schema";
import * as service from "./service";

export async function createCategoryAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const input = categoryInputSchema.parse(raw);
    const supabase = await createServerSupabase();

    const category = await service.createCategory(supabase, user.id, input);
    revalidatePath("/categorias");
    return success({ id: category.id });
  } catch (error) {
    return failure(error);
  }
}

export async function updateCategoryAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const input = categoryUpdateSchema.parse(raw);
    const supabase = await createServerSupabase();

    const category = await service.updateCategoryById(supabase, user.id, input);
    revalidatePath("/categorias");
    return success({ id: category.id });
  } catch (error) {
    return failure(error);
  }
}

export async function archiveCategoryAction(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const supabase = await createServerSupabase();
    await service.archiveCategory(supabase, user.id, id);
    revalidatePath("/categorias");
    return success(undefined);
  } catch (error) {
    return failure(error);
  }
}

export async function setBudgetAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const input = budgetInputSchema.parse(raw);
    const supabase = await createServerSupabase();

    const budget = await service.setBudget(supabase, user.id, input);
    revalidatePath("/categorias");
    revalidatePath("/dashboard");
    return success({ id: budget.id });
  } catch (error) {
    return failure(error);
  }
}
