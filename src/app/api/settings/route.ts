import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logging/log";
import { SettingsSchema } from "@/domain/settings/schema";
import { readSettings, resetSettings, writeSettings } from "@/domain/settings/store";

const log = createLogger("api/settings");

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await readSettings());
}

export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "The request body is not JSON." }, { status: 400 });
  }

  const parsed = SettingsSchema.safeParse(body);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    return NextResponse.json({ error: `Those settings are not valid. ${detail}` }, { status: 400 });
  }

  try {
    const saved = await writeSettings(parsed.data);
    return NextResponse.json(saved);
  } catch (err) {
    log.error("could not write settings", err);
    return NextResponse.json(
      { error: `Settings could not be written to disk: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  return NextResponse.json(await resetSettings());
}
