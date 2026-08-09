import { NextResponse } from "next/server";
import { PersonaSnapshotSchema } from "@/domain/persona/schema";
import { previewChanges } from "@/domain/persona/versions";

export const dynamic = "force-dynamic";

/** The diff shown before a save: "3 changes will create version 7". */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = PersonaSnapshotSchema.safeParse((body as { snapshot?: unknown })?.snapshot);
  if (!parsed.success) {
    return NextResponse.json({ error: "That persona is not valid." }, { status: 400 });
  }
  return NextResponse.json({ changes: await previewChanges(parsed.data) });
}
