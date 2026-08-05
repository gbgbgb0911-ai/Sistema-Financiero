import type { Metadata } from "next";
import { ChatPanel } from "@/components/features/assistant/ChatPanel";
import { isAiConfigured } from "@/server/anthropic/client";

export const metadata: Metadata = { title: "Asistente" };

export default function AssistantPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <ChatPanel enabled={isAiConfigured()} />
    </div>
  );
}
