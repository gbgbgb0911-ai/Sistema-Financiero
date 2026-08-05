"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase, requireUser } from "@/server/supabase/server";
import { failure, success, type ActionResult } from "@/core/errors";
import { cardInputSchema, cardUpdateSchema } from "./schema";
import * as service from "./service";

export async function createCardAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const input = cardInputSchema.parse(raw);
    const supabase = await createServerSupabase();

    const card = await service.createCard(supabase, user.id, input);
    revalidatePath("/tarjetas");
    return success({ id: card.id });
  } catch (error) {
    return failure(error);
  }
}

export async function updateCardAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const input = cardUpdateSchema.parse(raw);
    const supabase = await createServerSupabase();

    const card = await service.updateCardById(supabase, user.id, input);
    revalidatePath("/tarjetas");
    return success({ id: card.id });
  } catch (error) {
    return failure(error);
  }
}

export async function archiveCardAction(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const supabase = await createServerSupabase();
    await service.archiveCard(supabase, user.id, id);
    revalidatePath("/tarjetas");
    return success(undefined);
  } catch (error) {
    return failure(error);
  }
}
