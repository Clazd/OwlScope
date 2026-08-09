import { NextResponse } from "next/server";
import { listVersions, restoreVersion } from "@/domain/persona/versions";

export const dynamic = "force-dynamic";

export async function GET() {
  const versions = await listVersions();
  // The snapshots are large and the list only needs their headers.
  return NextResponse.json(
    versions.map((v) => ({
      version: v.version,
      changeReason: v.changeReason,
      changeCount: v.changeCount,
      createdAt: v.createdAt,
      personaName: v.snapshot.persona.name,
    })),
  );
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { restore?: number };
  if (typeof body.restore !== "number") {
    return NextResponse.json({ error: 'Send { "restore": <version number> }.' }, { status: 400 });
  }
  try {
    const result = await restoreVersion(body.restore);
    return NextResponse.json({
      snapshot: result.snapshot,
      version: result.version.version,
      changeCount: result.version.changeCount,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 404 });
  }
}
