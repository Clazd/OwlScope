import "server-only";
import { join } from "node:path";
import { feedbackStore } from "@/domain/feedback/store";
import type { TodayRejectionFeedback } from "@/domain/feedback/schema";
import { readPersonaOrEmpty } from "@/domain/persona/store";
import { contentStore, sourceStore, topicStore } from "@/domain/studio/store";
import { todayStore } from "@/domain/today/store";
import { atomicWriteJson } from "@/services/storage/atomic-write";
import { CACHE_ROOT, DIRS } from "@/services/storage/paths";
import { sourceSignature } from "@/services/storage/source-signature";
import { readDataText } from "@/services/storage/text-file";
import { MemoryIndexSchema, type MemoryEntry, type MemoryIndex } from "./schema";

const MEMORY_INDEX_FILE = join(CACHE_ROOT, "memory.json");
const MEMORY_SOURCES = [DIRS.content, DIRS.topics, DIRS.sources, DIRS.feedback, DIRS.todayCache, DIRS.persona] as const;

export async function rebuildMemoryIndex(): Promise<MemoryIndex> {
  const [content, topics, sources, feedback, days, persona] = await Promise.all([
    contentStore.list(),
    topicStore.list(),
    sourceStore.list(),
    feedbackStore.list(),
    todayStore.list(),
    readPersonaOrEmpty(),
  ]);
  const topicById = new Map(topics.map((topic) => [topic.id, topic]));
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const pillarById = new Map(persona.pillars.map((pillar) => [pillar.id, pillar.name]));
  const rejectionByContent = new Map<string, TodayRejectionFeedback[]>();
  for (const item of feedback) {
    if (item.kind !== "today-rejection" || item.undoneAt) continue;
    const list = rejectionByContent.get(item.contentId) ?? [];
    list.push(item);
    rejectionByContent.set(item.contentId, list);
  }

  const entries: MemoryEntry[] = content.map((item) => {
    const topic = topicById.get(item.topicId);
    const rejections = rejectionByContent.get(item.id) ?? [];
    const labels = [...new Set([...item.rejectionReasons, ...rejections.flatMap((entry) => entry.reasons)])];
    const note = rejections.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.note ?? "";
    return {
      id: item.id,
      kind: "content" as const,
      date: (item.publishedAt ?? item.createdAt).slice(0, 10),
      createdAt: item.createdAt,
      publishedAt: item.publishedAt,
      publicUrl: item.publicUrl,
      status: item.status,
      topicId: item.topicId,
      topic: topic?.title ?? item.thesis,
      pillarId: topic?.pillarId ?? null,
      pillar: topic?.pillarId ? (pillarById.get(topic.pillarId) ?? "Unassigned") : "Unassigned",
      freshness: topic?.freshness ?? "evergreen",
      angle: item.angle,
      thesis: item.thesis,
      text: item.text,
      characterCount: item.characterCount,
      personaVersion: item.personaVersion,
      runId: item.runId,
      reasoning: item.reasoning,
      sentences: item.sentences,
      sources: item.sourceIds.flatMap((id) => {
        const source = sourceById.get(id);
        return source ? [{
          id: source.id,
          title: source.title,
          url: source.url,
          domain: source.domain,
          publishedAt: source.publishedAt,
          sourceQuality: source.sourceQuality,
        }] : [];
      }),
      feedbackLabels: labels,
      feedbackNote: note,
    };
  });

  const contentDates = new Set(entries.map((entry) => entry.date));
  for (const day of days) {
    if (day.status !== "skip" || contentDates.has(day.date)) continue;
    entries.push({
      id: `skip-${day.date}`,
      kind: "skip",
      date: day.date,
      createdAt: day.generatedAt,
      status: "skipped",
      topicId: null,
      topic: "",
      pillarId: null,
      pillar: "",
      angle: "",
      thesis: "",
      text: day.skipReason || "Nothing worth posting.",
      characterCount: null,
      personaVersion: null,
      runId: day.runId,
      reasoning: `${day.consideredCount} considered · ${day.rejectedSimilar} similar · ${day.rejectedWeak} below threshold`,
      sentences: [],
      sources: [],
      feedbackLabels: [],
      feedbackNote: "",
    });
  }

  entries.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const index = MemoryIndexSchema.parse({
    version: 2,
    builtAt: new Date().toISOString(),
    sourceSignature: await sourceSignature(MEMORY_SOURCES),
    entries,
  });
  await atomicWriteJson(MEMORY_INDEX_FILE, index);
  return index;
}

export async function getMemoryIndex(): Promise<MemoryIndex> {
  try {
    const [cached, currentSignature] = await Promise.all([
      readDataText(MEMORY_INDEX_FILE).then((raw) => MemoryIndexSchema.parse(JSON.parse(raw))),
      sourceSignature(MEMORY_SOURCES),
    ]);
    if (cached.sourceSignature === currentSignature) return cached;
  } catch {
    // A missing, old, or corrupt derived cache is repaired from source files.
  }
  return rebuildMemoryIndex();
}
