import { NextResponse } from "next/server";
import { z } from "zod";
import { analyseEvolution, resolveSuggestion } from "@/domain/evolution/evolve";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("analyse") }),
  z.object({ action: z.enum(["accept", "reject", "suppress"]), id: z.string().min(1), value: z.number().min(0).max(100).optional() }),
]);

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Choose a valid evolution action." }, { status: 400 });
  try {
    if (parsed.data.action === "analyse") return NextResponse.json(await analyseEvolution());
    return NextResponse.json({ suggestion: await resolveSuggestion(parsed.data.id, parsed.data.action, parsed.data.value) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Evolution failed." }, { status: 409 });
  }
}
