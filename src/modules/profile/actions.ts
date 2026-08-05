"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase, requireUser } from "@/server/supabase/server";
import { failure, success, type ActionResult } from "@/core/errors";
import { profileUpdateSchema } from "./schema";
import * as service from "./service";

export async function updateProfileAction(raw: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const input = profileUpdateSchema.parse(raw);
    const supabase = await createServerSupabase();

    await service.updateProfileById(supabase, user.id, input);

    revalidatePath("/ajustes");
    revalidatePath("/dashboard");

    return success(undefined);
  } catch (error) {
    // El teléfono es único: si otro usuario ya lo registró, hay que decirlo
    // con claridad en vez de mostrar un fallo genérico.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "23505"
    ) {
      return {
        ok: false,
        error: {
          code: "CONFLICT",
          message: "Ese número de teléfono ya está registrado en otra cuenta.",
        },
      };
    }
    return failure(error);
  }
}

export async function completeOnboardingAction(): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const supabase = await createServerSupabase();
    await service.completeOnboarding(supabase, user.id);
    revalidatePath("/dashboard");
    return success(undefined);
  } catch (error) {
    return failure(error);
  }
}
