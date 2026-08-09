import { z } from "zod";
import { ContentStatusSchema, SentenceSchema, SourceQualitySchema } from "@/domain/studio/schema";

export const MemorySourceSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  domain: z.string(),
  publishedAt: z.string().nullable(),
  sourceQuality: SourceQualitySchema,
});

export const MemoryContentEntrySchema = z.object({
  id: z.string(),
  kind: z.literal("content"),
  date: z.string(),
  createdAt: z.string(),
  publishedAt: z.string().nullable(),
  publicUrl: z.string().nullable(),
  status: ContentStatusSchema,
  topicId: z.string(),
  topic: z.string(),
  pillarId: z.string().nullable(),
  pillar: z.string(),
  freshness: z.enum(["current", "evergreen"]),
  angle: z.string(),
  thesis: z.string(),
  text: z.string(),
  characterCount: z.number().int().min(0),
  personaVersion: z.number().int().min(0),
  runId: z.string(),
  reasoning: z.string(),
  sentences: z.array(SentenceSchema),
  sources: z.array(MemorySourceSchema),
  feedbackLabels: z.array(z.string()),
  feedbackNote: z.string(),
});

export const MemorySkipEntrySchema = z.object({
  id: z.string(),
  kind: z.literal("skip"),
  date: z.string(),
  createdAt: z.string(),
  status: z.literal("skipped"),
  topicId: z.null(),
  topic: z.string(),
  pillarId: z.null(),
  pillar: z.string(),
  angle: z.string(),
  thesis: z.string(),
  text: z.string(),
  characterCount: z.null(),
  personaVersion: z.null(),
  runId: z.string().nullable(),
  reasoning: z.string(),
  sentences: z.array(z.never()),
  sources: z.array(z.never()),
  feedbackLabels: z.array(z.never()),
  feedbackNote: z.string(),
});

export const MemoryEntrySchema = z.discriminatedUnion("kind", [
  MemoryContentEntrySchema,
  MemorySkipEntrySchema,
]);
export type MemoryEntry = z.infer<typeof MemoryEntrySchema>;
export type MemoryContentEntry = z.infer<typeof MemoryContentEntrySchema>;

export const MemoryIndexSchema = z.object({
  version: z.literal(2),
  builtAt: z.string(),
  sourceSignature: z.string().length(64),
  entries: z.array(MemoryEntrySchema),
});
export type MemoryIndex = z.infer<typeof MemoryIndexSchema>;

export interface MemoryFilters {
  query?: string;
  pillar?: string;
  status?: string;
  angle?: string;
  feedback?: string;
  from?: string;
  to?: string;
}
