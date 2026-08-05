import { describe, it, expect } from "vitest";
import {
  currentStatementCycle,
  cardUtilization,
  estimateMinimumPayment,
} from "@/core/statements";

describe("currentStatementCycle", () => {
  it("cuando aún no llega el corte, el ciclo cierra este mes", () => {
    // Corte el 25, hoy es 10: el ciclo vigente cierra el 25 de este mes.
    const cycle = currentStatementCycle(25, 12, new Date(Date.UTC(2026, 2, 10)));
    expect(cycle.end.toISOString().slice(0, 10)).toBe("2026-03-25");
    expect(cycle.start.toISOString().slice(0, 10)).toBe("2026-02-26");
  });

  it("pasado el corte, el ciclo vigente cierra el mes siguiente", () => {
    const cycle = currentStatementCycle(25, 12, new Date(Date.UTC(2026, 2, 28)));
    expect(cycle.end.toISOString().slice(0, 10)).toBe("2026-04-25");
  });

  it("si el día de pago es menor que el de corte, vence el mes siguiente", () => {
    // Corte el 25, pago el 12 → vence el 12 del mes siguiente al corte.
    const cycle = currentStatementCycle(25, 12, new Date(Date.UTC(2026, 2, 10)));
    expect(cycle.dueDate.toISOString().slice(0, 10)).toBe("2026-04-12");
  });

  it("ajusta el día de corte al último día del mes cuando no existe", () => {
    // Corte el 31 en febrero → 28.
    const cycle = currentStatementCycle(31, 15, new Date(Date.UTC(2026, 1, 10)));
    expect(cycle.end.toISOString().slice(0, 10)).toBe("2026-02-28");
  });
});

describe("cardUtilization", () => {
  it("clasifica según los umbrales de scoring crediticio", () => {
    expect(cardUtilization(200, 1000).level).toBe("healthy");
    expect(cardUtilization(400, 1000).level).toBe("moderate");
    expect(cardUtilization(750, 1000).level).toBe("high");
    expect(cardUtilization(950, 1000).level).toBe("critical");
  });

  it("no divide por cero cuando la tarjeta no tiene límite", () => {
    const result = cardUtilization(500, null);
    expect(result.percent).toBeNull();
    expect(result.level).toBe("healthy");
  });
});

describe("estimateMinimumPayment", () => {
  it("aplica el 5% con un piso mínimo", () => {
    expect(estimateMinimumPayment(1000)).toBe(50);
    expect(estimateMinimumPayment(100)).toBe(20); // el piso gana sobre el 5%
  });

  it("no exige pago mínimo sin saldo", () => {
    expect(estimateMinimumPayment(0)).toBe(0);
  });

  it("nunca pide más de lo que se debe", () => {
    expect(estimateMinimumPayment(8)).toBe(8);
  });
});
