import { describe, it, expect } from "vitest";
import {
  groupTotals,
  detectAnomalies,
  detectSubscriptions,
  budgetStatus,
  categoryTrends,
  projectPeriodTotal,
  type ExpensePoint,
} from "@/core/analytics";

function expense(overrides: Partial<ExpensePoint> & { amount: number }): ExpensePoint {
  return {
    id: Math.random().toString(36).slice(2),
    occurredAt: "2026-03-15T12:00:00Z",
    categoryId: "cat-1",
    categoryName: "Restaurantes",
    merchantId: "m-1",
    merchantName: "Comercio",
    cardId: "card-1",
    cardName: "Visa",
    ...overrides,
  };
}

describe("groupTotals", () => {
  it("agrupa y ordena de mayor a menor con porcentajes", () => {
    const result = groupTotals(
      [
        expense({ amount: 100, categoryId: "a", categoryName: "Comida" }),
        expense({ amount: 300, categoryId: "b", categoryName: "Transporte" }),
        expense({ amount: 100, categoryId: "a", categoryName: "Comida" }),
      ],
      "category",
    );

    expect(result[0]!.label).toBe("Transporte");
    expect(result[0]!.total).toBe(300);
    expect(result[0]!.percentage).toBe(60);
    expect(result[1]!.count).toBe(2);
  });

  it("agrupa los gastos sin categoría en vez de descartarlos", () => {
    const result = groupTotals(
      [expense({ amount: 50, categoryId: null, categoryName: null })],
      "category",
    );
    expect(result[0]!.label).toBe("Sin categoría");
  });
});

describe("detectAnomalies", () => {
  it("detecta un gasto atípico dentro de su propia categoría", () => {
    const normal = Array.from({ length: 10 }, () => expense({ amount: 30 }));
    const outlier = expense({ amount: 300, id: "raro" });

    const anomalies = detectAnomalies([...normal, outlier]);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]!.expenseId).toBe("raro");
  });

  it("no marca nada con pocas muestras: la desviación no significaría nada", () => {
    const expenses = [expense({ amount: 30 }), expense({ amount: 500 })];
    expect(detectAnomalies(expenses)).toHaveLength(0);
  });

  it("compara contra la media de la categoría, no la global", () => {
    // Un alquiler de 2000 no es anómalo entre alquileres.
    const rent = Array.from({ length: 6 }, () =>
      expense({ amount: 2000, categoryId: "rent", categoryName: "Vivienda" }),
    );
    const coffee = Array.from({ length: 6 }, () =>
      expense({ amount: 10, categoryId: "cafe", categoryName: "Café" }),
    );

    expect(detectAnomalies([...rent, ...coffee])).toHaveLength(0);
  });
});

describe("detectSubscriptions", () => {
  it("identifica cargos regulares del mismo comercio con importe estable", () => {
    const charges = [0, 30, 60, 90].map((offset) =>
      expense({
        amount: 44.9,
        merchantId: "netflix",
        merchantName: "Netflix",
        occurredAt: new Date(Date.now() - (120 - offset) * 86_400_000).toISOString(),
      }),
    );

    const [subscription] = detectSubscriptions(charges);
    expect(subscription?.merchantName).toBe("Netflix");
    expect(subscription?.averageIntervalDays).toBe(30);
    expect(subscription?.monthlyEstimate).toBeCloseTo(44.9, 1);
  });

  it("descarta comercios con importes muy variables: es un supermercado, no una suscripción", () => {
    const charges = [10, 250, 40, 900].map((amount, index) =>
      expense({
        amount,
        merchantId: "market",
        merchantName: "Supermercado",
        occurredAt: new Date(Date.now() - (120 - index * 30) * 86_400_000).toISOString(),
      }),
    );

    expect(detectSubscriptions(charges)).toHaveLength(0);
  });

  it("descarta comercios con intervalos irregulares", () => {
    const charges = [0, 2, 45, 47].map((offset) =>
      expense({
        amount: 20,
        merchantId: "irregular",
        merchantName: "Irregular",
        occurredAt: new Date(Date.now() - (100 - offset) * 86_400_000).toISOString(),
      }),
    );

    expect(detectSubscriptions(charges)).toHaveLength(0);
  });
});

describe("budgetStatus", () => {
  it("marca advertencia a partir del 80%", () => {
    expect(budgetStatus(1000, 850, "c", "Comida").level).toBe("warning");
  });

  it("marca excedido al pasar del 100%", () => {
    const status = budgetStatus(1000, 1200, "c", "Comida");
    expect(status.level).toBe("exceeded");
    expect(status.remaining).toBe(-200);
  });

  it("calcula el ritmo diario disponible", () => {
    const status = budgetStatus(1000, 400, "c", "Comida", 10);
    expect(status.dailyAllowance).toBe(60);
  });

  it("no ofrece ritmo diario si ya se excedió", () => {
    expect(budgetStatus(1000, 1200, "c", "Comida", 10).dailyAllowance).toBeNull();
  });
});

describe("categoryTrends", () => {
  it("ordena por variación absoluta, no porcentual", () => {
    const current = [
      expense({ amount: 20, categoryId: "small", categoryName: "Pequeña" }),
      expense({ amount: 1000, categoryId: "big", categoryName: "Grande" }),
    ];
    const previous = [
      expense({ amount: 10, categoryId: "small", categoryName: "Pequeña" }),
      expense({ amount: 800, categoryId: "big", categoryName: "Grande" }),
    ];

    // "Pequeña" subió 100% pero solo 10; "Grande" subió 25% pero 200.
    // Lo relevante es la segunda.
    expect(categoryTrends(current, previous)[0]!.categoryName).toBe("Grande");
  });
});

describe("projectPeriodTotal", () => {
  it("proyecta linealmente según el ritmo actual", () => {
    expect(projectPeriodTotal(500, 10, 30)).toBe(1500);
  });

  it("devuelve cero si no ha transcurrido tiempo", () => {
    expect(projectPeriodTotal(500, 0, 30)).toBe(0);
  });
});
