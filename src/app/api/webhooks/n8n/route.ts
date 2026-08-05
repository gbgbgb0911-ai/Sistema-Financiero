import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { createAdminClient } from "@/server/supabase/admin";
import { createExpense } from "@/modules/expenses/service";
import { expenseInputSchema } from "@/modules/expenses/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Entrada para automatizaciones externas (n8n).
 *
 * El núcleo del sistema no vive en n8n a propósito: los flujos críticos son
 * código versionado y testeable. Esta ruta expone una superficie acotada para
 * que el usuario construya sus propias automatizaciones sin tocar ese núcleo.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Integración no configurada" }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-signature");

  if (!signature) return new NextResponse("Falta la firma", { status: 401 });

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(signature, "hex");

  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  ) {
    return new NextResponse("Firma inválida", { status: 401 });
  }

  const payload = JSON.parse(rawBody) as { userId?: string; action?: string; data?: unknown };

  if (!payload.userId) {
    return NextResponse.json({ error: "Falta userId" }, { status: 400 });
  }

  const supabase = createAdminClient();

  switch (payload.action) {
    case "create_expense": {
      const input = expenseInputSchema.parse(payload.data);
      const result = await createExpense(supabase, payload.userId, input, { source: "import" });
      return NextResponse.json({ ok: true, expenseId: result.expense.id });
    }
    default:
      return NextResponse.json({ error: `Acción no soportada: ${payload.action}` }, { status: 400 });
  }
}
