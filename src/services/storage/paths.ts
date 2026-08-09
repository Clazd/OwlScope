import { isAbsolute, relative, resolve } from "node:path";

/**
 * Every path in the storage layer is derived from here. `DATA_DIR` can be
 * overridden so tests get a throwaway directory instead of the real /data.
 */
export const DATA_ROOT: string = process.env.DATA_DIR
  ? resolve(process.env.DATA_DIR)
  : resolve(process.cwd(), "data");

export const CACHE_ROOT: string = resolve(DATA_ROOT, ".cache");
export const QUARANTINE_ROOT: string = resolve(CACHE_ROOT, "quarantine");
export const FIXTURES_ROOT: string = process.env.FIXTURES_DIR
  ? resolve(process.env.FIXTURES_DIR)
  : resolve(process.cwd(), "fixtures");

export const DIRS = {
  settings: DATA_ROOT,
  persona: resolve(DATA_ROOT, "persona"),
  personaVersions: resolve(DATA_ROOT, "persona", "versions"),
  topics: resolve(DATA_ROOT, "topics"),
  /** In-progress Studio runs. Working state, not the published artefact. */
  studio: resolve(DATA_ROOT, "studio"),
  content: resolve(DATA_ROOT, "content"),
  sources: resolve(DATA_ROOT, "sources"),
  runs: resolve(DATA_ROOT, "runs"),
  metrics: resolve(DATA_ROOT, "metrics"),
  feedback: resolve(DATA_ROOT, "feedback"),
  exports: resolve(DATA_ROOT, "exports"),
  personaSuggestions: resolve(DATA_ROOT, "persona", "suggestions"),
  todayCache: resolve(CACHE_ROOT, "today"),
} as const;

export const SETTINGS_FILE: string = resolve(DATA_ROOT, "settings.json");

/** Guards against a caller escaping /data with `..` in an id. */
export function assertInsideData(path: string): void {
  const target = resolve(path);
  const fromRoot = relative(DATA_ROOT, target);
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) {
    throw new Error(`Refusing to touch a path outside the data directory: ${target}`);
  }
}
