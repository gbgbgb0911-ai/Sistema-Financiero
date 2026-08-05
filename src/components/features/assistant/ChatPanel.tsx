"use client";

import { useRef, useState } from "react";
import { Send, Sparkles, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
  tools?: string[];
}

const SUGGESTIONS = [
  "¿Cuánto gasté este mes?",
  "¿En qué gasto demasiado?",
  "¿Qué pagos tengo esta semana?",
  "¿Cuál fue mi mayor gasto?",
];

/**
 * Chat del asistente con streaming.
 *
 * La respuesta se muestra conforme llega: aparecer en medio segundo se percibe
 * mucho más rápido que la misma respuesta completa a los cinco segundos.
 */
export function ChatPanel({ enabled }: { enabled: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    if (!text.trim() || streaming) return;

    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    setStreaming(true);

    // Burbuja vacía del asistente: se rellena con los deltas del stream.
    setMessages((prev) => [...prev, { role: "assistant", content: "", tools: [] }]);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });

      if (!response.ok || !response.body) {
        throw new Error("La respuesta del asistente no llegó");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const event = JSON.parse(line.slice(6)) as { type: string; value: string };

          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (!last || last.role !== "assistant") return prev;

            if (event.type === "text") {
              next[next.length - 1] = { ...last, content: last.content + event.value };
            } else if (event.type === "tool") {
              next[next.length - 1] = { ...last, tools: [...(last.tools ?? []), event.value] };
            }
            return next;
          });
        }
      }
    } catch {
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = {
          role: "assistant",
          content: "No pude completar la consulta. Inténtalo de nuevo.",
        };
        return next;
      });
    } finally {
      setStreaming(false);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      });
    }
  }

  if (!enabled) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="rounded-full bg-muted p-3">
            <Sparkles className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="font-medium">El asistente no está configurado</p>
            <p className="mx-auto max-w-sm text-sm text-muted-foreground">
              Añade <code className="rounded bg-muted px-1">ANTHROPIC_API_KEY</code> a tus
              variables de entorno para activarlo. El resto de la aplicación funciona sin ello.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-11rem)] flex-col gap-3">
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <div className="rounded-full bg-primary/10 p-3">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div className="space-y-1">
              <p className="font-medium">Pregúntame sobre tus finanzas</p>
              <p className="text-sm text-muted-foreground">
                Puedo consultar tus gastos, pagos y tarjetas, y también registrar movimientos.
              </p>
            </div>
            <ul className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <li key={suggestion}>
                  <button
                    type="button"
                    onClick={() => send(suggestion)}
                    className="rounded-full border border-border px-3 py-1.5 text-xs transition-colors hover:bg-accent"
                  >
                    {suggestion}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={index}
              className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-lg px-3.5 py-2.5 text-sm",
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-card",
                )}
              >
                {/* Las herramientas usadas se muestran: el usuario ve de dónde
                    sale cada cifra en lugar de recibir un número sin origen. */}
                {message.tools && message.tools.length > 0 ? (
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Wrench className="h-3 w-3" />
                    {[...new Set(message.tools)].join(", ")}
                  </p>
                ) : null}
                <p className="whitespace-pre-wrap leading-relaxed">
                  {message.content ||
                    (streaming && index === messages.length - 1 ? "Pensando…" : "")}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send(input);
        }}
        className="flex gap-2"
      >
        <Input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Escribe tu consulta…"
          disabled={streaming}
          aria-label="Mensaje para el asistente"
        />
        <Button type="submit" size="icon" disabled={streaming || !input.trim()}>
          <Send className="h-4 w-4" />
          <span className="sr-only">Enviar</span>
        </Button>
      </form>
    </div>
  );
}
