import { describe, it, expect } from "vitest";
import {
  resolvePeriod,
  startOfDayInZone,
  startOfWeekInZone,
  addMonths,
  daysInMonth,
  toISODate,
  eachDayInRange,
} from "@/core/dates";

const LIMA = "America/Lima"; // UTC-5, sin horario de verano
const MADRID = "Europe/Madrid"; // Con horario de verano

describe("zonas horarias", () => {
  it("calcula el inicio del día según la zona del usuario, no la del servidor", () => {
    // 23:30 del 15 de marzo en Lima son las 04:30 UTC del 16.
    const reference = new Date("2026-03-16T04:30:00Z");
    const start = startOfDayInZone(reference, LIMA);
    expect(start.toISOString()).toBe("2026-03-15T05:00:00.000Z");
  });

  it("la semana empieza en lunes", () => {
    // 2026-03-18 es miércoles.
    const start = startOfWeekInZone(new Date("2026-03-18T12:00:00Z"), LIMA);
    expect(toISODate(start, LIMA)).toBe("2026-03-16"); // lunes
  });

  it("respeta el cambio de horario de verano", () => {
    const summer = startOfDayInZone(new Date("2026-07-15T10:00:00Z"), MADRID);
    const winter = startOfDayInZone(new Date("2026-01-15T10:00:00Z"), MADRID);
    // Verano es UTC+2, invierno UTC+1: los instantes UTC del inicio del día difieren.
    expect(summer.getUTCHours()).toBe(22);
    expect(winter.getUTCHours()).toBe(23);
  });
});

describe("addMonths", () => {
  it("no desborda al mes siguiente cuando el día no existe", () => {
    // 31 de enero + 1 mes debe ser 28 de febrero, no 3 de marzo.
    const result = addMonths(new Date(Date.UTC(2026, 0, 31)), 1);
    expect(result.toISOString().slice(0, 10)).toBe("2026-02-28");
  });

  it("contempla los años bisiestos", () => {
    const result = addMonths(new Date(Date.UTC(2028, 0, 31)), 1);
    expect(result.toISOString().slice(0, 10)).toBe("2028-02-29");
  });
});

describe("daysInMonth", () => {
  it("cuenta correctamente febrero", () => {
    expect(daysInMonth(2026, 1)).toBe(28);
    expect(daysInMonth(2028, 1)).toBe(29);
  });
});

describe("resolvePeriod", () => {
  it("devuelve el período anterior equivalente para poder comparar", () => {
    const { current, previous } = resolvePeriod("month", LIMA, new Date("2026-03-15T12:00:00Z"));
    expect(toISODate(current.from, LIMA)).toBe("2026-03-01");
    expect(toISODate(previous.from, LIMA)).toBe("2026-02-01");
  });

  it("el período anterior de 'hoy' es ayer", () => {
    const { previous } = resolvePeriod("today", LIMA, new Date("2026-03-15T12:00:00Z"));
    expect(toISODate(previous.from, LIMA)).toBe("2026-03-14");
  });
});

describe("eachDayInRange", () => {
  it("genera la serie de días del rango", () => {
    const range = {
      from: new Date("2026-03-01T05:00:00Z"),
      to: new Date("2026-03-05T05:00:00Z"),
    };
    expect(eachDayInRange(range, LIMA)).toEqual([
      "2026-03-01",
      "2026-03-02",
      "2026-03-03",
      "2026-03-04",
    ]);
  });
});
