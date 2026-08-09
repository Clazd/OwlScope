import "server-only";
import { join } from "node:path";
import { dateKey } from "@/lib/ids";
import { atomicWriteJson, atomicWriteText } from "@/services/storage/atomic-write";
import { DIRS } from "@/services/storage/paths";
import { rebuildMemoryIndex } from "./index";
import type { MemoryContentEntry } from "./schema";

export type MemoryExportFormat = "json" | "markdown";

export async function exportMemory(format: MemoryExportFormat): Promise<{ name: string; body: string; contentType: string }> {
  const index = await rebuildMemoryIndex();
  const stamp = dateKey();
  if (format === "json") {
    const name = `grounded-voice-memory-${stamp}.json`;
    const file = join(DIRS.exports, name);
    await atomicWriteJson(file, index.entries);
    return { name, body: `${JSON.stringify(index.entries, null, 2)}\n`, contentType: "application/json; charset=utf-8" };
  }

  const published = index.entries.filter(
    (entry): entry is MemoryContentEntry => entry.kind === "content" && entry.status === "published",
  );
  const body = [
    "# Published posts",
    "",
    ...published.flatMap((entry) => [
      `## ${entry.date} · ${entry.pillar}`,
      "",
      entry.text,
      "",
      `- Angle: ${entry.angle || "Unassigned"}`,
      `- Persona version: ${entry.personaVersion}`,
      ...(entry.publicUrl ? [`- Public URL: ${entry.publicUrl}`] : []),
      "",
    ]),
  ].join("\n");
  const name = `grounded-voice-published-${stamp}.md`;
  const file = join(DIRS.exports, name);
  await atomicWriteText(file, `${body.trim()}\n`);
  return { name, body: `${body.trim()}\n`, contentType: "text/markdown; charset=utf-8" };
}
