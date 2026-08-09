import { NextResponse } from "next/server";
import { z } from "zod";
import { analysePersonaImport } from "@/domain/persona/import";
import { PersonaSnapshotSchema } from "@/domain/persona/schema";
import { ProviderError } from "@/services/ai/types";

export const dynamic = "force-dynamic";

const ImportBodySchema = z.object({
  input: z.string().trim().min(20).max(50_000),
  snapshot: PersonaSnapshotSchema,
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = ImportBodySchema.safeParse(body);
  if (!parsed.success) {
    const inputIssue = parsed.error.issues.find((issue) => issue.path[0] === "input");
    return NextResponse.json(
      { error: inputIssue ? "Paste at least 20 characters (up to 50,000)." : "The current Brain snapshot is not valid." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(await analysePersonaImport(parsed.data.input, parsed.data.snapshot));
  } catch (error) {
    if (error instanceof ProviderError) {
      const status = error.category === "auth" || error.category === "config" ? 503 : 502;
      return NextResponse.json({ error: error.message, category: error.category }, { status });
    }
    return NextResponse.json(
      { error: `The profile could not be analysed: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    );
  }
}

