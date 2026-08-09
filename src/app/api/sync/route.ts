import { NextResponse } from "next/server";
import { syncPull, syncPush } from "@/services/sync/git";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { action?: string };

  if (body.action === "pull") return NextResponse.json(await syncPull());
  if (body.action === "push") return NextResponse.json(await syncPush());

  return NextResponse.json({ error: 'Send { "action": "pull" } or { "action": "push" }.' }, { status: 400 });
}
