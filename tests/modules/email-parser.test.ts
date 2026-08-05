import { describe, it, expect } from "vitest";
import {
  matchRule,
  parseWithRule,
  looksLikeTransactionEmail,
  parseFlexibleDate,
} from "@/modules/email-ingest/parser";
import type { EmailRuleRow } from "@/types/database";

const bcpRule: EmailRuleRow = {
  id: "rule-bcp",
  user_id: null,
  issuer_name: "BCP",
  from_pattern: "notificaciones@.*bcp\\.com\\.pe",
  subject_pattern: "(consumo|compra)",
  extractors: {
    amount: "(?:S/|SOLES?)\\s*([0-9][0-9,]*\\.?[0-9]{0,2})",
    amount_usd: "(?:US\\$|\\$)\\s*([0-9][0-9,]*\\.?[0-9]{0,2})",
    merchant: "en\\s+(.+?)\\s+(?:el|por|con|\\.|,|$)",
    card_last4: "(?:terminada en|final)\\s*([0-9]{4})",
    datetime: "([0-9]{2}/[0-9]{2}/[0-9]{4})",
  },
  currency_hint: "PEN",
  priority: 10,
  is_active: true,
  hit_count: 0,
  miss_count: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const email = {
  messageId: "msg-1",
  from: "notificaciones@notificacionesbcp.com.pe",
  subject: "Consumo con tu tarjeta",
  body: "Realizaste un consumo de S/ 89.90 en PLAZA VEA SURCO el 15/03/2026 a las 14:32 con tu tarjeta terminada en 4821.",
  receivedAt: "2026-03-15T19:35:00Z",
};

describe("matchRule", () => {
  it("selecciona la regla del emisor correcto", () => {
    expect(matchRule(email, [bcpRule])?.issuer_name).toBe("BCP");
  });

  it("no aplica una regla cuyo remitente no coincide", () => {
    const otherEmail = { ...email, from: "alertas@otrobanco.com" };
    expect(matchRule(otherEmail, [bcpRule])).toBeNull();
  });

  it("respeta la prioridad cuando varias reglas encajan", () => {
    const generic: EmailRuleRow = {
      ...bcpRule,
      id: "generic",
      issuer_name: "Genérica",
      from_pattern: ".*",
      priority: 500,
    };
    expect(matchRule(email, [generic, bcpRule])?.issuer_name).toBe("BCP");
  });

  it("ignora una regex mal formada en vez de romper el sync entero", () => {
    const broken: EmailRuleRow = { ...bcpRule, id: "broken", from_pattern: "([", priority: 1 };
    expect(matchRule(email, [broken, bcpRule])?.issuer_name).toBe("BCP");
  });
});

describe("parseWithRule", () => {
  it("extrae importe, comercio, tarjeta y fecha", () => {
    const parsed = parseWithRule(email, bcpRule);

    expect(parsed.amount).toBe(89.9);
    expect(parsed.currency).toBe("PEN");
    expect(parsed.cardLast4).toBe("4821");
    expect(parsed.merchant).toContain("Plaza Vea");
    expect(parsed.transactionType).toBe("purchase");
    expect(parsed.method).toBe("rules");
  });

  it("da confianza alta cuando todos los campos aparecen", () => {
    expect(parseWithRule(email, bcpRule).confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("baja la confianza cuando faltan campos secundarios", () => {
    const partial = { ...email, body: "Consumo de S/ 50.00 realizado." };
    const parsed = parseWithRule(partial, bcpRule);

    expect(parsed.amount).toBe(50);
    expect(parsed.confidence).toBeLessThan(0.9);
  });

  it("sin importe la confianza es cero: un gasto sin monto no sirve", () => {
    const noAmount = { ...email, body: "Tu tarjeta terminada en 4821 fue activada." };
    expect(parseWithRule(noAmount, bcpRule).confidence).toBe(0);
  });

  it("detecta importes en dólares", () => {
    const usd = { ...email, body: "Consumo de US$ 12.99 en NETFLIX el 15/03/2026." };
    const parsed = parseWithRule(usd, bcpRule);

    expect(parsed.amount).toBe(12.99);
    expect(parsed.currency).toBe("USD");
  });

  it("distingue una devolución de un consumo", () => {
    const refund = {
      ...email,
      subject: "Devolución procesada",
      body: "Se procesó la devolución de S/ 89.90 en PLAZA VEA el 15/03/2026.",
    };
    expect(parseWithRule(refund, bcpRule).transactionType).toBe("refund");
  });

  it("funciona sobre cuerpos en HTML", () => {
    const html = {
      ...email,
      body: "<html><body><p>Consumo de <b>S/ 45.00</b> en STARBUCKS el 15/03/2026</p></body></html>",
    };
    expect(parseWithRule(html, bcpRule).amount).toBe(45);
  });
});

describe("looksLikeTransactionEmail", () => {
  it("acepta notificaciones de consumo", () => {
    expect(looksLikeTransactionEmail(email)).toBe(true);
  });

  it("descarta promociones", () => {
    expect(
      looksLikeTransactionEmail({ ...email, subject: "Promoción especial para ti" }),
    ).toBe(false);
  });
});

describe("parseFlexibleDate", () => {
  it("interpreta DD/MM/YYYY, no MM/DD", () => {
    // 03/04 debe ser 3 de abril; leerlo como 4 de marzo desplazaría los gastos.
    const iso = parseFlexibleDate("03/04/2026");
    expect(iso?.slice(0, 10)).toBe("2026-04-03");
  });

  it("toma la hora del contexto cuando está disponible", () => {
    const iso = parseFlexibleDate("15/03/2026", "operación a las 14:32 horas");
    expect(iso).toContain("T14:32");
  });

  it("devuelve null si la fecha no es interpretable", () => {
    expect(parseFlexibleDate("no es una fecha")).toBeNull();
  });
});
