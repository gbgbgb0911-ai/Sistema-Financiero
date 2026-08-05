import { describe, it, expect } from "vitest";
import { expandOccurrences, nextOccurrence, reminderSchedule } from "@/core/recurrence";

describe("expandOccurrences", () => {
  it("genera vencimientos mensuales", () => {
    const dates = expandOccurrences(
      { frequency: "monthly", anchorDate: "2026-03-15" },
      "2026-06-30",
    );
    expect(dates).toEqual(["2026-03-15", "2026-04-15", "2026-05-15", "2026-06-15"]);
  });

  it("conserva el día de anclaje tras un mes corto", () => {
    // Anclado al 31: febrero ajusta al 28, pero marzo vuelve al 31.
    // Sumar días en vez de meses iría desplazando la fecha mes a mes.
    const dates = expandOccurrences(
      { frequency: "monthly", anchorDate: "2026-01-31" },
      "2026-04-30",
    );
    expect(dates).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("respeta la fecha de fin", () => {
    const dates = expandOccurrences(
      { frequency: "monthly", anchorDate: "2026-01-10", endDate: "2026-03-01" },
      "2026-12-31",
    );
    expect(dates).toEqual(["2026-01-10", "2026-02-10"]);
  });

  it("un pago único genera una sola ocurrencia", () => {
    const dates = expandOccurrences({ frequency: "once", anchorDate: "2026-05-20" }, "2026-12-31");
    expect(dates).toEqual(["2026-05-20"]);
  });

  it("genera vencimientos semanales y quincenales", () => {
    expect(
      expandOccurrences({ frequency: "weekly", anchorDate: "2026-03-02" }, "2026-03-23"),
    ).toEqual(["2026-03-02", "2026-03-09", "2026-03-16", "2026-03-23"]);

    expect(
      expandOccurrences({ frequency: "biweekly", anchorDate: "2026-03-02" }, "2026-03-30"),
    ).toEqual(["2026-03-02", "2026-03-16", "2026-03-30"]);
  });

  it("no entra en bucle infinito con reglas mal formadas", () => {
    const dates = expandOccurrences(
      { frequency: "weekly", anchorDate: "2020-01-01" },
      "2050-01-01",
    );
    expect(dates.length).toBeLessThanOrEqual(1000);
  });
});

describe("nextOccurrence", () => {
  it("devuelve el siguiente vencimiento posterior a la fecha dada", () => {
    expect(nextOccurrence({ frequency: "monthly", anchorDate: "2026-01-15" }, "2026-03-20")).toBe(
      "2026-04-15",
    );
  });

  it("devuelve null cuando la regla ya terminó", () => {
    expect(
      nextOccurrence(
        { frequency: "monthly", anchorDate: "2026-01-15", endDate: "2026-02-28" },
        "2026-03-20",
      ),
    ).toBeNull();
  });
});

describe("reminderSchedule", () => {
  it("programa aviso un día antes, el mismo día y tras el vencimiento", () => {
    const schedule = reminderSchedule("2026-03-15", [1, 0], 9);

    expect(schedule).toEqual([
      { kind: "day_before", date: "2026-03-14", hour: 9 },
      { kind: "due_day", date: "2026-03-15", hour: 9 },
      { kind: "overdue", date: "2026-03-16", hour: 9 },
    ]);
  });

  it("siempre incluye el aviso de vencido, aunque no se pidan recordatorios previos", () => {
    const schedule = reminderSchedule("2026-03-15", [], 9);
    expect(schedule).toHaveLength(1);
    expect(schedule[0]!.kind).toBe("overdue");
  });
});
