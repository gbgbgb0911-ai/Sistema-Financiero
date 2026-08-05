/**
 * Detección de intenciones de respuesta rápida.
 *
 * Cuando alguien responde "pagado" a un recordatorio, mandar eso al modelo es
 * gastar dinero y latencia en algo que una expresión regular resuelve. La IA se
 * reserva para lo que de verdad requiere lenguaje natural.
 */

export type QuickIntent =
  | { kind: "pay" }
  | { kind: "snooze"; hours: number }
  | { kind: "postpone"; days: number }
  | { kind: "skip" }
  | { kind: "confirm" }
  | { kind: "reject" }
  | { kind: "help" }
  | null;

const NORMALIZE = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/**
 * Intenta resolver el mensaje sin IA.
 * Devuelve `null` si el texto no encaja de forma inequívoca, en cuyo caso se
 * deriva al asistente. Ante la duda siempre gana la IA: un falso positivo aquí
 * marcaría un pago como pagado sin que la persona lo pidiera.
 */
export function detectQuickIntent(rawText: string): QuickIntent {
  const text = NORMALIZE(rawText);

  // Solo se aceptan mensajes cortos: "pagado" es una respuesta; "ya pagué el
  // internet pero no la luz, ¿cuánto debo?" es una consulta para la IA.
  if (text.length > 40) return null;

  if (/^(pagado|pague|pagué|ya pague|ya pagué|listo|hecho|si pague)\.?$/.test(text)) {
    return { kind: "pay" };
  }

  if (/^(omitir|saltar|cancelar|no aplica|no va)\.?$/.test(text)) {
    return { kind: "skip" };
  }

  if (/^(ayuda|help|opciones|que puedes hacer)\??$/.test(text)) {
    return { kind: "help" };
  }

  // "recuérdame más tarde", "recuérdame en 2 horas"
  const snoozeMatch = text.match(
    /^(recuerdame|recordar|luego|mas tarde|despues)(\s+(en\s+)?(\d+)\s*(h|hora|horas))?/,
  );
  if (snoozeMatch) {
    const hours = snoozeMatch[4] ? Number(snoozeMatch[4]) : 3;
    return { kind: "snooze", hours: Math.min(Math.max(hours, 1), 24) };
  }

  // "posponer", "posponer 3 días"
  const postponeMatch = text.match(/^(posponer|aplazar|mover)(\s+(\d+)\s*(d|dia|dias)?)?/);
  if (postponeMatch) {
    const days = postponeMatch[3] ? Number(postponeMatch[3]) : 3;
    return { kind: "postpone", days: Math.min(Math.max(days, 1), 90) };
  }

  if (/^(si|sí|correcto|confirmo|ok|dale|va)\.?$/.test(text)) return { kind: "confirm" };
  if (/^(no|nop|incorrecto|negativo)\.?$/.test(text)) return { kind: "reject" };

  return null;
}

export const HELP_MESSAGE = `Puedo ayudarte con tus finanzas. Prueba con:

• "¿Cuánto gasté hoy?"
• "Registra un gasto de 35 en gasolina"
• "¿Qué pagos tengo esta semana?"
• "¿Cuánto debo en mi tarjeta?"
• "Marcar Netflix como pagado"
• "¿En qué gasto demasiado?"

Cuando te avise de un pago, puedes responder: Pagado, Recuérdame más tarde, Posponer o Cancelar.`;
