import { NextResponse } from "next/server";
import { clearCache, deleteAllData, resetWritingMemory, summariseData } from "@/services/storage/data-admin";
import { countFixtures } from "@/services/ai/sandbox";

export const dynamic = "force-dynamic";

export async function GET() {
  const [summary, fixtures] = await Promise.all([summariseData(), countFixtures()]);
  return NextResponse.json({ ...summary, fixtures });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { action?: string; confirm?: string };

  if (body.action === "clear-cache") {
    await clearCache();
    return NextResponse.json({ ok: true, message: "Cache index cleared and rebuilt." });
  }

  if (body.action === "delete-all") {
    // The typed confirmation is checked on the server too, not only in the UI.
    if (body.confirm !== "delete all data") {
      return NextResponse.json(
        { error: 'Type "delete all data" to confirm.' },
        { status: 400 },
      );
    }
    const removed = await deleteAllData();
    return NextResponse.json({ ok: true, message: `Deleted ${removed} file(s).` });
  }

  if (body.action === "reset-memory") {
    if (body.confirm !== "reset writing memory") {
      return NextResponse.json(
        { error: 'Type "reset writing memory" to confirm.' },
        { status: 400 },
      );
    }
    const removed = await resetWritingMemory();
    return NextResponse.json({
      ok: true,
      message: `Writing memory reset. Deleted ${removed} archive, feedback, metric, export, and suggestion file(s).`,
    });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
