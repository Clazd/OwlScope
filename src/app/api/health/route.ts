import { NextResponse } from "next/server";

/**
 * Lightweight health check. Returns basic diagnostics without touching the AI
 * provider or any user data. Useful for verifying the server is running.
 */
export async function GET() {
  const dataDir = process.env.DATA_DIR || "data";
  const sandbox = process.env.SANDBOX_MODE === "true";

  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    sandbox,
    dataDir,
    node: process.version,
  });
}
