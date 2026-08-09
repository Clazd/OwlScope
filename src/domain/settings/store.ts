import "server-only";
import { createJsonStore } from "@/services/storage/json-store";
import { DATA_ROOT } from "@/services/storage/paths";
import { DEFAULT_SETTINGS, SettingsSchema, type Settings } from "./schema";

/**
 * Settings is a single document, but it goes through the same store as
 * everything else so it gets atomic writes, validation and quarantine for free.
 */
const store = createJsonStore<Settings>(DATA_ROOT, SettingsSchema, {
  fileName: () => "settings.json",
});

export async function readSettings(): Promise<Settings> {
  const found = await store.get("settings");
  if (found) return found;
  // Missing or quarantined: fall back to defaults without writing, so a boot
  // read never has a side effect.
  return DEFAULT_SETTINGS;
}

export async function writeSettings(next: Settings): Promise<Settings> {
  return store.put({ ...next, id: "settings", updatedAt: new Date().toISOString() });
}

export async function patchSettings(changes: Partial<Settings>): Promise<Settings> {
  const current = await readSettings();
  return writeSettings({ ...current, ...changes });
}

export async function resetSettings(): Promise<Settings> {
  return writeSettings(DEFAULT_SETTINGS);
}

/**
 * Sandbox is on when either the env flag or the saved setting says so. The env
 * flag wins on the way up only — you can turn sandbox on from the environment
 * without editing settings, but you cannot turn it off from the UI if the
 * environment demanded it.
 */
export function sandboxFromEnv(): boolean {
  return process.env.SANDBOX_MODE === "true";
}

export async function sandboxEnabled(): Promise<boolean> {
  if (sandboxFromEnv()) return true;
  const settings = await readSettings();
  return settings.sandbox.enabled;
}
