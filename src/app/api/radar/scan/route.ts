import { NextResponse } from "next/server";
import { z } from "zod";
import { isPersonaStarted } from "@/domain/persona/defaults";
import { readPersonaOrEmpty } from "@/domain/persona/store";
import { runRadarScan } from "@/domain/radar/scan";
import { findRunByKey } from "@/services/runs/recorder";

export const dynamic = "force-dynamic";
const Body = z.object({ idempotencyKey: z.string().nullable().optional() });

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "That scan request is not valid." }, { status: 400 });
  const persona = await readPersonaOrEmpty();
  if (!isPersonaStarted(persona)) {
    return NextResponse.json({ error: "Finish Brain onboarding before Radar can judge relevance." }, { status: 400 });
  }
  const key = parsed.data.idempotencyKey ?? null;
  if (key) {
    const existing = await findRunByKey(key);
    if (existing) return NextResponse.json({ replayed: true, runId: existing.id });
  }
  if (request.headers.get("accept")?.includes("application/x-ndjson")) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const send = (value: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
        void runRadarScan(key, (event) => send({ type: "progress", event }))
          .then((result) => send({ type: "result", result }))
          .catch((error) => send({ type: "error", error: error instanceof Error ? error.message : String(error) }))
          .finally(() => controller.close());
      },
    });
    return new Response(stream, {
      headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
    });
  }
  try {
    return NextResponse.json(await runRadarScan(key));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
