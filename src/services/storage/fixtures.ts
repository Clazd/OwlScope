import { readFile, readdir } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { FIXTURES_ROOT } from "./paths";

/**
 * Reading `/fixtures`. It lives here rather than in the sandbox provider so
 * that `services/storage` really is the only place in the app that touches
 * `fs` - the rule holds with no exception to remember.
 *
 * Fixtures are read-only. There is no writer, by design: fixtures are authored
 * by hand and committed, never generated at runtime.
 */

export class FixtureNotFoundError extends Error {
  readonly path: string;
  constructor(path: string) {
    super(`No fixture at ${path}`);
    this.name = "FixtureNotFoundError";
    this.path = path;
  }
}

/** Slugs the segments and refuses anything that would escape /fixtures. */
export function fixturePath(stage: string, kase: string): string {
  const safe = (s: string) => s.replace(/[^a-z0-9._-]/gi, "-");
  const path = resolve(FIXTURES_ROOT, safe(stage), `${safe(kase)}.json`);
  const fromRoot = relative(FIXTURES_ROOT, path);
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) {
    throw new FixtureNotFoundError(path);
  }
  return path;
}

/** The relative path, for error messages the user can act on. */
export function fixtureLabel(stage: string, kase: string): string {
  return `fixtures/${stage}/${kase}.json`;
}

export async function readFixture(stage: string, kase: string): Promise<string> {
  const path = fixturePath(stage, kase);
  try {
    return await readFile(path, "utf8");
  } catch {
    throw new FixtureNotFoundError(path);
  }
}

export async function countFixtureFiles(): Promise<number> {
  async function walk(dir: string): Promise<number> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return 0;
    }
    let total = 0;
    for (const entry of entries) {
      if (entry.isDirectory()) total += await walk(join(dir, entry.name));
      else if (entry.name.endsWith(".json")) total += 1;
    }
    return total;
  }
  return walk(FIXTURES_ROOT);
}
