import { NextResponse } from "next/server";
import { buildDemoSnapshot } from "@/domain/persona/demo";
import { deletePersonaData } from "@/domain/persona/store";
import { saveAsNewVersion } from "@/domain/persona/versions";

export const dynamic = "force-dynamic";

/** Loads Nova. Nothing in the app branches on whether the persona is Nova. */
export async function POST() {
  // Replace rather than merge: loading a demo over a half-built persona would
  // leave a hybrid nobody asked for.
  await deletePersonaData();
  const result = await saveAsNewVersion(buildDemoSnapshot(), "Loaded the Nova demo persona");
  return NextResponse.json({ snapshot: result.snapshot, version: result.version.version });
}

export async function DELETE() {
  await deletePersonaData();
  return NextResponse.json({ ok: true, message: "Persona deleted." });
}
