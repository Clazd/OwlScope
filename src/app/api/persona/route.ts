import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logging/log";
import { PersonaSnapshotSchema } from "@/domain/persona/schema";
import { readSnapshot } from "@/domain/persona/store";
import { saveAsNewVersion } from "@/domain/persona/versions";
import { z } from "zod";

const log = createLogger("api/persona");

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await readSnapshot());
}

const SaveBody = z.object({
  snapshot: PersonaSnapshotSchema,
  changeReason: z.string().default(""),
});

/** Every save creates a new version. There is no in-place update. */
export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "The request body is not JSON." }, { status: 400 });
  }

  const parsed = SaveBody.safeParse(body);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    return NextResponse.json({ error: `That persona is not valid. ${detail}` }, { status: 400 });
  }

  try {
    const result = await saveAsNewVersion(parsed.data.snapshot, parsed.data.changeReason);
    return NextResponse.json({
      snapshot: result.snapshot,
      version: result.version.version,
      changeCount: result.version.changeCount,
    });
  } catch (err) {
    log.error("could not save the persona", err);
    return NextResponse.json(
      { error: `The persona could not be written to disk: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}
