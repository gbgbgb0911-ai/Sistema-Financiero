import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { resolvePeriod, type PeriodKey, formatDate } from "@/core/dates";
import { formatMoney, type CurrencyCode } from "@/core/money";
import { groupTotals, topMerchants } from "@/core/analytics";
import { findExpensesInRange, findExpenses } from "@/modules/expenses/repository";
import { createExpense } from "@/modules/expenses/service";
import { toExpensePoint } from "@/modules/dashboard/service";
import { findCategoryByName, findCategories } from "@/modules/categories/repository";
import { getBudgetStatuses } from "@/modules/categories/service";
import { findCards } from "@/modules/cards/repository";
import { getCardWithBalance } from "@/modules/cards/service";
import {
  findUpcomingOccurrences,
  findOccurrenceByPaymentName,
} from "@/modules/payments/repository";
import { applyOccurrenceAction, createPayment } from "@/modules/payments/service";

/**
 * Herramientas del asistente.
 *
 * Todas operan sobre el `userId` de la sesión, que se inyecta en el contexto y
 * NO es un parámetro que el modelo pueda elegir. Aunque el modelo intentara
 * consultar los datos de otra persona, no tiene por dónde expresarlo.
 */

type Client = SupabaseClient<Database>;

export interface ToolContext {
  client: Client;
  userId: string;
  timezone: string;
  currency: CurrencyCode;
  locale: string;
}

/**
 * Definiciones. El orden es estable para no invalidar el prompt caching:
 * las tools se serializan al principio del prompt, así que reordenarlas
 * obligaría a reprocesar todo el prefijo en cada petición.
 */
export const ASSISTANT_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_spending_summary",
    description:
      "Total gastado en un período, con comparación contra el período anterior, " +
      "media diaria y categoría principal. Úsala para '¿cuánto gasté hoy/esta semana/este mes?'.",
    input_schema: {
      type: "object",
      properties: {
        period: {
          type: "string",
          enum: ["today", "yesterday", "week", "month", "quarter", "year"],
          description: "Período a resumir.",
        },
      },
      required: ["period"],
    },
  },
  {
    name: "get_category_breakdown",
    description:
      "Desglose de gastos por categoría en un período, con importe, número de " +
      "movimientos y porcentaje sobre el total. Úsala para '¿en qué gasto más?' " +
      "o '¿cuánto gasté en restaurantes?'.",
    input_schema: {
      type: "object",
      properties: {
        period: {
          type: "string",
          enum: ["today", "yesterday", "week", "month", "quarter", "year"],
        },
        categoryName: {
          type: "string",
          description: "Opcional. Filtra a una sola categoría por nombre aproximado.",
        },
      },
      required: ["period"],
    },
  },
  {
    name: "list_expenses",
    description:
      "Lista movimientos concretos con comercio, importe y fecha. Úsala cuando " +
      "pidan ver gastos, buscar uno concreto o saber cuál fue el mayor gasto.",
    input_schema: {
      type: "object",
      properties: {
        period: {
          type: "string",
          enum: ["today", "yesterday", "week", "month", "quarter", "year"],
        },
        search: { type: "string", description: "Texto a buscar en comercio o notas." },
        categoryName: { type: "string", description: "Filtra por categoría." },
        sortBy: {
          type: "string",
          enum: ["date", "amount"],
          description: "Ordena por fecha (por defecto) o por importe, para el 'mayor gasto'.",
        },
        limit: { type: "integer", minimum: 1, maximum: 25, description: "Máximo 25." },
      },
      required: ["period"],
    },
  },
  {
    name: "get_upcoming_payments",
    description:
      "Pagos programados próximos y vencidos, con fecha e importe. Úsala para " +
      "'¿qué pagos tengo mañana?' o '¿qué me toca pagar?'.",
    input_schema: {
      type: "object",
      properties: {
        daysAhead: {
          type: "integer",
          minimum: 1,
          maximum: 90,
          description: "Días hacia adelante. Por defecto 30.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_card_balance",
    description:
      "Saldo del ciclo de facturación vigente de una tarjeta, con límite, " +
      "utilización y fecha de vencimiento. Úsala para '¿cuánto debo en mi tarjeta?'.",
    input_schema: {
      type: "object",
      properties: {
        cardName: {
          type: "string",
          description: "Nombre o últimos 4 dígitos. Si se omite, devuelve todas.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_budget_status",
    description:
      "Estado de los presupuestos del período: importe asignado, gastado, " +
      "restante y ritmo diario disponible. Úsala para '¿en qué gasto demasiado?' " +
      "o '¿cómo voy con el presupuesto?'.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "create_expense",
    description:
      "Registra un gasto. Requiere el monto. Úsala cuando digan algo como " +
      "'registra un gasto de 35 en gasolina' o 'gasté 20 soles en el almuerzo'.",
    input_schema: {
      type: "object",
      properties: {
        amount: { type: "number", description: "Importe, siempre positivo." },
        currency: { type: "string", enum: ["PEN", "USD", "EUR"] },
        merchant: { type: "string", description: "Comercio o concepto." },
        categoryName: { type: "string", description: "Categoría; se resuelve por nombre." },
        cardName: { type: "string", description: "Tarjeta o método de pago." },
        occurredAt: {
          type: "string",
          description: "ISO 8601. Si se omite, se usa el momento actual.",
        },
        notes: { type: "string" },
      },
      required: ["amount"],
    },
  },
  {
    name: "mark_payment_paid",
    description:
      "Marca como pagado el próximo vencimiento de un pago programado, buscándolo " +
      "por nombre. Úsala para 'marcar Netflix como pagado'.",
    input_schema: {
      type: "object",
      properties: {
        paymentName: { type: "string", description: "Nombre del pago, aproximado." },
      },
      required: ["paymentName"],
    },
  },
  {
    name: "create_payment",
    description:
      "Crea un pago programado recurrente. Úsala para 'agrega un pago de internet el día 15'.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        amount: { type: "number" },
        currency: { type: "string", enum: ["PEN", "USD", "EUR"] },
        frequency: {
          type: "string",
          enum: ["once", "weekly", "biweekly", "monthly", "quarterly", "yearly"],
          description: "Por defecto monthly.",
        },
        dayOfMonth: {
          type: "integer",
          minimum: 1,
          maximum: 31,
          description: "Día del mes del primer vencimiento.",
        },
        anchorDate: { type: "string", description: "Fecha YYYY-MM-DD; alternativa a dayOfMonth." },
        categoryName: { type: "string" },
      },
      required: ["name", "amount"],
    },
  },
];

type ToolInput = Record<string, unknown>;

/** Ejecuta la tool solicitada y devuelve un resultado legible por el modelo. */
export async function executeTool(
  name: string,
  input: ToolInput,
  ctx: ToolContext,
): Promise<string> {
  try {
    switch (name) {
      case "get_spending_summary":
        return await getSpendingSummary(input, ctx);
      case "get_category_breakdown":
        return await getCategoryBreakdown(input, ctx);
      case "list_expenses":
        return await listExpensesTool(input, ctx);
      case "get_upcoming_payments":
        return await getUpcomingPayments(input, ctx);
      case "get_card_balance":
        return await getCardBalance(input, ctx);
      case "get_budget_status":
        return await getBudgetStatusTool(ctx);
      case "create_expense":
        return await createExpenseTool(input, ctx);
      case "mark_payment_paid":
        return await markPaymentPaid(input, ctx);
      case "create_payment":
        return await createPaymentTool(input, ctx);
      default:
        return `Error: herramienta desconocida "${name}".`;
    }
  } catch (error) {
    // El error se devuelve al modelo como texto para que pueda explicarlo o
    // intentar otra vía, en vez de romper la conversación.
    const message = error instanceof Error ? error.message : "error desconocido";
    return `Error al ejecutar ${name}: ${message}`;
  }
}

// -- Implementaciones ---------------------------------------------------------

function money(ctx: ToolContext, amount: number): string {
  return formatMoney(amount, ctx.currency, ctx.locale);
}

async function getSpendingSummary(input: ToolInput, ctx: ToolContext): Promise<string> {
  const period = (input.period as PeriodKey) ?? "month";
  const { current, previous } = resolvePeriod(period, ctx.timezone);

  const [currentExpenses, previousExpenses] = await Promise.all([
    findExpensesInRange(ctx.client, ctx.userId, current.from.toISOString(), current.to.toISOString()),
    findExpensesInRange(ctx.client, ctx.userId, previous.from.toISOString(), previous.to.toISOString()),
  ]);

  const points = currentExpenses.map(toExpensePoint);
  const total = points.reduce((sum, p) => sum + p.amount, 0);
  const previousTotal = previousExpenses
    .map(toExpensePoint)
    .reduce((sum, p) => sum + p.amount, 0);

  const byCategory = groupTotals(points, "category");
  const days = Math.max(
    1,
    Math.round((Math.min(Date.now(), current.to.getTime()) - current.from.getTime()) / 86_400_000),
  );

  const changeText =
    previousTotal > 0
      ? `${(((total - previousTotal) / previousTotal) * 100).toFixed(1)}% respecto al período anterior (${money(ctx, previousTotal)})`
      : "sin período anterior con el que comparar";

  return JSON.stringify({
    periodo: period,
    total: money(ctx, total),
    movimientos: points.length,
    variacion: changeText,
    media_diaria: money(ctx, total / days),
    categoria_principal: byCategory[0]
      ? `${byCategory[0].label} (${money(ctx, byCategory[0].total)})`
      : "ninguna",
    comercio_principal: topMerchants(points, 1)[0]?.label ?? "ninguno",
  });
}

async function getCategoryBreakdown(input: ToolInput, ctx: ToolContext): Promise<string> {
  const period = (input.period as PeriodKey) ?? "month";
  const { current } = resolvePeriod(period, ctx.timezone);

  const expenses = await findExpensesInRange(
    ctx.client,
    ctx.userId,
    current.from.toISOString(),
    current.to.toISOString(),
  );

  let points = expenses.map(toExpensePoint);

  if (typeof input.categoryName === "string" && input.categoryName) {
    const category = await findCategoryByName(ctx.client, ctx.userId, input.categoryName);
    if (!category) {
      const all = await findCategories(ctx.client, ctx.userId);
      return `No existe una categoría parecida a "${input.categoryName}". Disponibles: ${all
        .map((c) => c.name)
        .join(", ")}.`;
    }
    points = points.filter((p) => p.categoryId === category.id);
  }

  const groups = groupTotals(points, "category");
  if (groups.length === 0) return `Sin gastos registrados en el período ${period}.`;

  return JSON.stringify({
    periodo: period,
    total: money(ctx, groups.reduce((s, g) => s + g.total, 0)),
    categorias: groups.map((g) => ({
      nombre: g.label,
      total: money(ctx, g.total),
      movimientos: g.count,
      porcentaje: `${g.percentage.toFixed(1)}%`,
    })),
  });
}

async function listExpensesTool(input: ToolInput, ctx: ToolContext): Promise<string> {
  const period = (input.period as PeriodKey) ?? "month";
  const { current } = resolvePeriod(period, ctx.timezone);

  let categoryIds: string[] | undefined;
  if (typeof input.categoryName === "string" && input.categoryName) {
    const category = await findCategoryByName(ctx.client, ctx.userId, input.categoryName);
    if (category) categoryIds = [category.id];
  }

  const { items } = await findExpenses(ctx.client, ctx.userId, {
    from: current.from.toISOString(),
    to: current.to.toISOString(),
    search: typeof input.search === "string" ? input.search : undefined,
    categoryIds,
    sortBy: input.sortBy === "amount" ? "amount" : "date",
    sortDir: "desc",
    limit: Math.min(Number(input.limit ?? 10), 25),
  });

  if (items.length === 0) return `Sin movimientos en el período ${period}.`;

  return JSON.stringify({
    movimientos: items.map((e) => ({
      comercio: e.merchant?.name ?? e.merchant_raw ?? e.description ?? "Sin comercio",
      monto: money(ctx, Number(e.amount)),
      categoria: e.category?.name ?? "Sin categoría",
      fecha: formatDate(e.occurred_at, ctx.timezone, ctx.locale, "datetime"),
      metodo: e.card?.name ?? "Sin método",
    })),
  });
}

async function getUpcomingPayments(input: ToolInput, ctx: ToolContext): Promise<string> {
  const daysAhead = Math.min(Number(input.daysAhead ?? 30), 90);
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + daysAhead * 86_400_000).toISOString().slice(0, 10);

  const occurrences = await findUpcomingOccurrences(ctx.client, ctx.userId, {
    to: horizon,
    limit: 30,
  });

  if (occurrences.length === 0) {
    return `Sin pagos programados en los próximos ${daysAhead} días.`;
  }

  return JSON.stringify({
    total_pendiente: money(
      ctx,
      occurrences.reduce((sum, o) => sum + Number(o.amount), 0),
    ),
    pagos: occurrences.map((o) => ({
      nombre: o.payment?.name ?? "Pago",
      monto: money(ctx, Number(o.amount)),
      vence: o.due_date,
      estado: o.due_date < today ? "VENCIDO" : "pendiente",
    })),
  });
}

async function getCardBalance(input: ToolInput, ctx: ToolContext): Promise<string> {
  const cards = await findCards(ctx.client, ctx.userId);
  if (cards.length === 0) return "No hay tarjetas registradas.";

  const query = typeof input.cardName === "string" ? input.cardName.toLowerCase() : null;
  const selected = query
    ? cards.filter(
        (c) => c.name.toLowerCase().includes(query) || (c.last4 ?? "").includes(query),
      )
    : cards;

  if (selected.length === 0) {
    return `No hay ninguna tarjeta que coincida con "${input.cardName}". Registradas: ${cards
      .map((c) => c.name)
      .join(", ")}.`;
  }

  const balances = await Promise.all(
    selected.map((card) => getCardWithBalance(ctx.client, ctx.userId, card)),
  );

  return JSON.stringify({
    tarjetas: balances.map((b) => ({
      nombre: b.card.name,
      terminada_en: b.card.last4 ?? "—",
      consumido_ciclo_actual: money(ctx, b.currentBalance),
      limite: b.card.credit_limit ? money(ctx, Number(b.card.credit_limit)) : "sin límite",
      utilizacion: b.utilization.percent !== null ? `${b.utilization.percent.toFixed(0)}%` : "—",
      vence: b.cycle ? b.cycle.dueDate.toISOString().slice(0, 10) : "sin ciclo configurado",
      dias_para_vencer: b.cycle ? b.cycle.daysUntilDue : null,
      pago_minimo_estimado: money(ctx, b.minimumPayment),
    })),
  });
}

async function getBudgetStatusTool(ctx: ToolContext): Promise<string> {
  const statuses = await getBudgetStatuses(ctx.client, ctx.userId, ctx.timezone);

  if (statuses.length === 0) {
    return "No hay presupuestos definidos. Sin un presupuesto no hay referencia contra la cual medir si un gasto es excesivo.";
  }

  return JSON.stringify({
    presupuestos: statuses.map((s) => ({
      categoria: s.categoryName,
      asignado: money(ctx, s.budget),
      gastado: money(ctx, s.spent),
      restante: money(ctx, s.remaining),
      usado: `${s.percentUsed}%`,
      estado:
        s.level === "exceeded" ? "EXCEDIDO" : s.level === "warning" ? "cerca del límite" : "bien",
      disponible_por_dia: s.dailyAllowance !== null ? money(ctx, s.dailyAllowance) : null,
    })),
  });
}

async function createExpenseTool(input: ToolInput, ctx: ToolContext): Promise<string> {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return "Error: el monto debe ser un número mayor que cero.";
  }

  let categoryId: string | null = null;
  if (typeof input.categoryName === "string" && input.categoryName) {
    const category = await findCategoryByName(ctx.client, ctx.userId, input.categoryName);
    categoryId = category?.id ?? null;
  }

  let cardId: string | null = null;
  if (typeof input.cardName === "string" && input.cardName) {
    const cards = await findCards(ctx.client, ctx.userId);
    const query = input.cardName.toLowerCase();
    cardId =
      cards.find((c) => c.name.toLowerCase().includes(query) || (c.last4 ?? "").includes(query))
        ?.id ?? null;
  }

  const result = await createExpense(
    ctx.client,
    ctx.userId,
    {
      amount,
      currency: (input.currency as CurrencyCode) ?? ctx.currency,
      merchantName: typeof input.merchant === "string" ? input.merchant : undefined,
      categoryId,
      cardId,
      occurredAt: typeof input.occurredAt === "string" ? input.occurredAt : undefined,
      notes: typeof input.notes === "string" ? input.notes : undefined,
      fxRate: 1,
    },
    { source: "whatsapp" },
  );

  // Se devuelve el contexto del mes para que el modelo pueda añadirlo a la
  // confirmación sin necesitar otra ronda de tools.
  const { current } = resolvePeriod("month", ctx.timezone);
  const monthExpenses = await findExpensesInRange(
    ctx.client,
    ctx.userId,
    current.from.toISOString(),
    current.to.toISOString(),
  );
  const points = monthExpenses.map(toExpensePoint);
  const categoryTotal = categoryId
    ? points.filter((p) => p.categoryId === categoryId).reduce((s, p) => s + p.amount, 0)
    : null;

  return JSON.stringify({
    registrado: true,
    id: result.expense.id,
    monto: money(ctx, amount),
    comercio: input.merchant ?? "sin especificar",
    categoria: input.categoryName ?? "sin categoría",
    posible_duplicado: result.flaggedAsDuplicate,
    total_mes: money(ctx, points.reduce((s, p) => s + p.amount, 0)),
    total_mes_en_categoria: categoryTotal !== null ? money(ctx, categoryTotal) : null,
  });
}

async function markPaymentPaid(input: ToolInput, ctx: ToolContext): Promise<string> {
  const name = String(input.paymentName ?? "");
  const occurrence = await findOccurrenceByPaymentName(ctx.client, ctx.userId, name);

  if (!occurrence) {
    return `No hay ningún vencimiento pendiente para un pago llamado "${name}".`;
  }

  const result = await applyOccurrenceAction(ctx.client, ctx.userId, {
    occurrenceId: occurrence.id,
    action: "pay",
  });

  return JSON.stringify({
    pagado: true,
    nombre: occurrence.payment?.name,
    monto: money(ctx, Number(occurrence.amount)),
    vencia: occurrence.due_date,
    gasto_creado: Boolean(result.expenseId),
  });
}

async function createPaymentTool(input: ToolInput, ctx: ToolContext): Promise<string> {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return "Error: el monto debe ser un número mayor que cero.";
  }

  let anchorDate: string;
  if (typeof input.anchorDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.anchorDate)) {
    anchorDate = input.anchorDate;
  } else if (typeof input.dayOfMonth === "number") {
    // "el día 15" significa el próximo 15, no el 15 que ya pasó.
    const now = new Date();
    const day = Math.min(input.dayOfMonth, 28);
    const candidate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day));
    if (candidate < now) candidate.setUTCMonth(candidate.getUTCMonth() + 1);
    anchorDate = candidate.toISOString().slice(0, 10);
  } else {
    anchorDate = new Date().toISOString().slice(0, 10);
  }

  let categoryId: string | null = null;
  if (typeof input.categoryName === "string" && input.categoryName) {
    const category = await findCategoryByName(ctx.client, ctx.userId, input.categoryName);
    categoryId = category?.id ?? null;
  }

  const payment = await createPayment(ctx.client, ctx.userId, {
    name: String(input.name),
    amount,
    currency: (input.currency as CurrencyCode) ?? ctx.currency,
    categoryId,
    cardId: null,
    frequency:
      (input.frequency as "once" | "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly") ??
      "monthly",
    anchorDate,
    endDate: null,
    reminderDays: [1, 0],
    autoCreateExpense: true,
  });

  return JSON.stringify({
    creado: true,
    id: payment.id,
    nombre: payment.name,
    monto: money(ctx, amount),
    frecuencia: payment.frequency,
    primer_vencimiento: anchorDate,
  });
}
