import "server-only";
import { createHash } from "node:crypto";
import { dateKey, newId } from "@/lib/ids";
import { createDataStore } from "@/services/storage/store-factory";
import { DIRS } from "@/services/storage/paths";
import {
  ContentItemSchema,
  SourceSchema,
  StudioSessionSchema,
  TopicSchema,
  type ContentItem,
  type Source,
  type StudioSession,
  type Topic,
} from "./schema";

/**
 * Four collections, all through `createDataStore`, so all four inherit atomic
 * writes, validated reads and quarantine-on-corruption.
 *
 * Topics, sources and content are one file per item - they are listed, filtered
 * and diffed independently, and a git diff that shows one changed post is worth
 * more than one that shows a rewritten array.
 */

export const topicStore = createDataStore<Topic>(DIRS.topics, "topics", TopicSchema, {
  fileName: (topic) => `topic-${topic.id}.json`,
});

export const sourceStore = createDataStore<Source>(DIRS.sources, "sources", SourceSchema, {
  fileName: (source) => `source-${source.id}.json`,
});

/** `/data/content/2026-08-09-<id>.json` - the date makes the directory readable. */
export const contentStore = createDataStore<ContentItem>(DIRS.content, "content", ContentItemSchema, {
  fileName: (item) => `${dateKey(new Date(item.createdAt))}-${item.id}.json`,
});

export const sessionStore = createDataStore<StudioSession>(DIRS.studio, "studio-sessions", StudioSessionSchema, {
  fileName: (session) => `session-${session.id}.json`,
});

/* ----------------------------------------------------------------- reads -- */

export async function sourcesForTopic(topicId: string): Promise<Source[]> {
  const all = await sourceStore.list({ topicId } as Partial<Source>);
  return all.sort((a, b) => a.id.localeCompare(b.id));
}

export async function sourcesByIds(ids: string[]): Promise<Source[]> {
  const wanted = new Set(ids);
  if (wanted.size === 0) return [];
  const all = await sourceStore.list();
  return all.filter((source) => wanted.has(source.id));
}

/**
 * The published and accepted history, newest first. This is what similarity
 * compares against and what the memory block samples from.
 */
export async function contentHistory(): Promise<ContentItem[]> {
  const all = await contentStore.list();
  return all
    .filter((item) => item.status === "published" || item.status === "accepted")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/* ------------------------------------------------------------------ ids -- */

/**
 * Source ids are short (`src_k3f9x1`) because they appear in every prompt and
 * in every sentence's `sourceIds`. A long id is tokens spent on nothing and one
 * more chance for a model to mistype a reference.
 *
 * They are derived from the URL rather than random, which buys two things: the
 * same page keeps the same id across runs and across machines, so a git diff of
 * `/data` stays readable; and the sandbox fixtures can cite a source by id and
 * actually match, which is what makes the offline pipeline coherent rather than
 * merely runnable.
 */
export function sourceIdFor(url: string, taken: ReadonlySet<string> = new Set()): string {
  const digest = createHash("sha256").update(url).digest("hex");
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const id = `src_${digest.slice(attempt * 6, attempt * 6 + 6)}`;
    if (!taken.has(id)) return id;
  }
  return `src_${newId()}`;
}

export { newId };
