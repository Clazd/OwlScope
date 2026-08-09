import { createHash } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { DATA_ROOT, assertInsideData } from "./paths";

async function jsonFiles(dir: string): Promise<string[]> {
  assertInsideData(dir);
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const nested = await Promise.all(entries.map(async (entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return jsonFiles(full);
    return entry.name.endsWith(".json") && !entry.name.endsWith(".tmp") ? [full] : [];
  }));
  return nested.flat();
}

/**
 * A cheap freshness key for derived indexes. It reads directory metadata, not
 * JSON bodies, so checking a thousand-item archive does not rebuild or parse it.
 */
export async function sourceSignature(directories: readonly string[]): Promise<string> {
  const files = (await Promise.all(directories.map(jsonFiles))).flat().sort();
  const metadata = await Promise.all(files.map(async (file) => {
    try {
      const info = await stat(file);
      return `${relative(DATA_ROOT, file)}\0${info.size}\0${info.mtimeMs}`;
    } catch (error) {
      // A source can be atomically renamed between readdir and stat. Omitting
      // it makes this signature differ and forces a safe rebuild next time.
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }));
  return createHash("sha256").update(metadata.filter((entry) => entry !== null).join("\n")).digest("hex");
}
