import { describe, it, expect } from "vitest";
import {
  toCents,
  toAmount,
  sumMoney,
  money,
  percentChange,
  parseAmountFromText,
  normalizeNumericString,
  detectCurrency,
  formatMoneyForScreenReader,
} from "@/core/money";

describe("aritmética en céntimos", () => {
  it("evita el error de redondeo de los floats", () => {
    // 0.1 + 0.2 === 0.30000000000000004 en coma flotante. En céntimos, no.
    const total = sumMoney([money(0.1), money(0.2)]);
    expect(toAmount(total.cents)).toBe(0.3);
  });

  it("no acumula error al sumar muchos importes pequeños", () => {
    const items = Array.from({ length: 1000 }, () => money(0.07));
    expect(toAmount(sumMoney(items).cents)).toBe(70);
  });

  it("redondea al céntimo más cercano", () => {
    expect(toCents(12.345)).toBe(1235);
    expect(toCents(12.344)).toBe(1234);
  });

  it("rechaza sumar monedas distintas en vez de dar un número sin sentido", () => {
    expect(() => sumMoney([money(10, "PEN"), money(10, "USD")])).toThrow(/monedas distintas/);
  });
});

describe("percentChange", () => {
  it("calcula la variación", () => {
    expect(percentChange(120, 100)).toBe(20);
    expect(percentChange(80, 100)).toBe(-20);
  });

  it("devuelve null cuando no hay base de comparación", () => {
    expect(percentChange(100, 0)).toBeNull();
  });

  it("trata 0 → 0 como sin cambio, no como indefinido", () => {
    expect(percentChange(0, 0)).toBe(0);
  });
});

describe("normalizeNumericString", () => {
  it("interpreta el formato anglosajón", () => {
    expect(normalizeNumericString("1,234.56")).toBe(1234.56);
  });

  it("interpreta el formato europeo", () => {
    expect(normalizeNumericString("1.234,56")).toBe(1234.56);
  });

  it("resuelve el separador ambiguo por el número de decimales", () => {
    // Los importes bancarios llevan siempre dos decimales, así que tres
    // dígitos detrás del separador solo pueden ser miles.
    expect(normalizeNumericString("1.234")).toBe(1234);
    expect(normalizeNumericString("1,234")).toBe(1234);
    expect(normalizeNumericString("1,50")).toBe(1.5);
    expect(normalizeNumericString("12.99")).toBe(12.99);
  });
});

describe("parseAmountFromText", () => {
  it("extrae importes de notificaciones bancarias reales", () => {
    expect(parseAmountFromText("Consumo de S/ 89.90 en PLAZA VEA")).toBe(89.9);
    expect(parseAmountFromText("Cargo por US$ 12.99")).toBe(12.99);
    expect(parseAmountFromText("gasté 35 soles en gasolina")).toBe(35);
    expect(parseAmountFromText("S/ 1,234.50 en tu tarjeta")).toBe(1234.5);
  });

  it("devuelve null cuando no hay importe", () => {
    expect(parseAmountFromText("Hola, ¿cómo estás?")).toBeNull();
  });
});

describe("detectCurrency", () => {
  it("distingue soles de dólares", () => {
    expect(detectCurrency("S/ 100")).toBe("PEN");
    expect(detectCurrency("US$ 100")).toBe("USD");
    expect(detectCurrency("100 dólares")).toBe("USD");
    expect(detectCurrency("sin moneda")).toBeNull();
  });
});

describe("formatMoneyForScreenReader", () => {
  it("produce texto legible en voz, no símbolos", () => {
    expect(formatMoneyForScreenReader(35.5, "PEN")).toBe("35 soles con 50");
    expect(formatMoneyForScreenReader(1, "PEN")).toBe("1 sol");
    expect(formatMoneyForScreenReader(12, "USD")).toBe("12 dólares");
  });
});
