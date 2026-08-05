import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, CategoryRow, BudgetRow } from "@/types/database";
import { DomainError } from "@/core/errors";
import { slugify } from "@/core/text";
import { budgetStatus, type BudgetStatus } from "@/core/analytics";
import { sumExpensesInRange } from "@/modules/expenses/repository";
import { resolvePeriod, daysBetween } from "@/core/dates";
import type { CategoryInput, CategoryUpdate, BudgetInput } from "./schema";
import * as repo from "./repository";

type Client = SupabaseClient<Database>;

export async function createCategory(
  client: Client,
  userId: string,
  input: CategoryInput,
): Promise<CategoryRow> {
  const slug = slugify(input.name);
  const existing = await repo.findCategoryBySlug(client, userId, slug);
  if (existing) throw DomainError.conflict(`Ya existe una categoría llamada "${input.name}".`);

  return repo.insertCategory(client, {
    user_id: userId,
    name: input.name,
    slug,
    kind: input.kind,
    icon: input.icon,
    color: input.color,
    parent_id: input.parentId ?? null,
    is_system: false,
  });
}

export async function updateCategoryById(
  client: Client,
  userId: string,
  input: CategoryUpdate,
): Promise<CategoryRow> {
  const { id, ...rest } = input;
  return repo.updateCategory(client, userId, id, {
    ...(rest.name !== undefined ? { name: rest.name, slug: slugify(rest.name) } : {}),
    ...(rest.icon !== undefined ? { icon: rest.icon } : {}),
    ...(rest.color !== undefined ? { color: rest.color } : {}),
    ...(rest.parentId !== undefined ? { parent_id: rest.parentId } : {}),
  });
}

export async function archiveCategory(client: Client, userId: string, id: string): Promise<void> {
  await repo.updateCategory(client, userId, id, { archived_at: new Date().toISOString() });
}

export async function listCategories(client: Client, userId: string) {
  return repo.findCategories(client, userId);
}

export async function setBudget(
  client: Client,
  userId: string,
  input: BudgetInput,
): Promise<BudgetRow> {
  return repo.upsertBudget(client, userId, {
    categoryId: input.categoryId ?? null,
    period: input.period,
    amount: input.amount,
    currency: input.currency,
  });
}

/**
 * Estado de los presupuestos del período actual.
 *
 * Sin esto la IA no puede responder "¿en qué gasto demasiado?": necesita una
 * referencia contra la que comparar, no solo el importe absoluto.
 */
export async function getBudgetStatuses(
  client: Client,
  userId: string,
  timezone: string,
): Promise<BudgetStatus[]> {
  const [budgets, categories] = await Promise.all([
    repo.findBudgets(client, userId),
    repo.findCategories(client, userId),
  ]);

  const categoryNames = new Map(categories.map((c) => [c.id, c.name]));
  const statuses: BudgetStatus[] = [];

  for (const budget of budgets) {
    const { current } = resolvePeriod(
      budget.period === "weekly" ? "week" : "month",
      timezone,
    );

    const { total } = await sumExpensesInRange(
      client,
      userId,
      current.from.toISOString(),
      current.to.toISOString(),
      budget.category_id,
    );

    const daysRemaining = Math.max(0, daysBetween(new Date(), current.to));

    statuses.push(
      budgetStatus(
        Number(budget.amount),
        total,
        budget.category_id,
        budget.category_id
          ? (categoryNames.get(budget.category_id) ?? "Sin categoría")
          : "Todas las categorías",
        daysRemaining,
      ),
    );
  }

  return statuses.sort((a, b) => b.percentUsed - a.percentUsed);
}

export { repo as categoryRepository };
