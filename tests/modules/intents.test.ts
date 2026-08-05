import { describe, it, expect } from "vitest";
import { detectQuickIntent } from "@/modules/assistant/intents";
import { normalizeMerchantName, htmlToText, similarity } from "@/core/text";

describe("detectQuickIntent", () => {
  it("reconoce las respuestas a un recordatorio sin pasar por la IA", () => {
    expect(detectQuickIntent("pagado")).toEqual({ kind: "pay" });
    expect(detectQuickIntent("Ya pagué")).toEqual({ kind: "pay" });
    expect(detectQuickIntent("listo")).toEqual({ kind: "pay" });
  });

  it("extrae el número de horas o días de la respuesta", () => {
    expect(detectQuickIntent("recuérdame en 2 horas")).toEqual({ kind: "snooze", hours: 2 });
    expect(detectQuickIntent("posponer 5 dias")).toEqual({ kind: "postpone", days: 5 });
  });

  it("aplica valores por defecto razonables", () => {
    expect(detectQuickIntent("más tarde")).toEqual({ kind: "snooze", hours: 3 });
    expect(detectQuickIntent("posponer")).toEqual({ kind: "postpone", days: 3 });
  });

  it("deriva a la IA cuando el mensaje es una consulta, no una respuesta", () => {
    expect(detectQuickIntent("¿cuánto gasté este mes?")).toBeNull();
    expect(detectQuickIntent("registra un gasto de 35 en gasolina")).toBeNull();
  });

  it("no interpreta mensajes largos: ante la duda, gana la IA", () => {
    // Marcar un pago como pagado por error es peor que gastar una llamada al modelo.
    expect(
      detectQuickIntent("ya pagué el internet pero no la luz, ¿cuánto debo en total?"),
    ).toBeNull();
  });

  it("acota los valores a rangos razonables", () => {
    expect(detectQuickIntent("recuérdame en 99 horas")).toEqual({ kind: "snooze", hours: 24 });
  });
});

describe("normalizeMerchantName", () => {
  it("agrupa las variantes del mismo comercio", () => {
    const variants = ["RAPPI*PERU LIMA 0034", "Rappi Peru SAC", "RAPPI  PERU"];
    const normalized = variants.map(normalizeMerchantName);

    expect(new Set(normalized).size).toBe(1);
    expect(normalized[0]).toBe("rappi");
  });

  it("quita acentos", () => {
    expect(normalizeMerchantName("Farmacia Perú Ñuñoa")).toBe("farmacia nunoa");
  });

  it("tolera entradas vacías", () => {
    expect(normalizeMerchantName(null)).toBe("");
    expect(normalizeMerchantName("")).toBe("");
  });
});

describe("htmlToText", () => {
  it("extrae el texto de un correo en HTML", () => {
    const html = "<div><style>p{color:red}</style><p>Consumo de <b>S/ 45.00</b></p></div>";
    const text = htmlToText(html);

    expect(text).toContain("S/ 45.00");
    expect(text).not.toContain("color:red");
    expect(text).not.toContain("<b>");
  });

  it("decodifica entidades HTML", () => {
    expect(htmlToText("Caf&amp;eacute; &amp; Bar")).toContain("&");
  });
});

describe("similarity", () => {
  it("puntúa alto textos casi idénticos", () => {
    expect(similarity("Starbucks", "starbucks")).toBe(1);
    expect(similarity("Starbucks", "Starbuck")).toBeGreaterThan(0.8);
  });

  it("puntúa bajo textos distintos", () => {
    expect(similarity("Starbucks", "Metro")).toBeLessThan(0.4);
  });
});
