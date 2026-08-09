import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function gitDataSyncEnabled() {
  if (process.env.GIT_SYNC_DATA !== undefined) return process.env.GIT_SYNC_DATA === "true";
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    const line = raw.split(/\r?\n/).find((entry) => /^\s*GIT_SYNC_DATA\s*=/.test(entry));
    return line?.replace(/^\s*GIT_SYNC_DATA\s*=\s*/, "").trim() === "true";
  } catch {
    return false;
  }
}

export function requirePrivateDataSync() {
  if (gitDataSyncEnabled()) return;
  console.error("Git data sync is disabled. Set GIT_SYNC_DATA=true only when this checkout and its remote are private.");
  process.exit(1);
}
