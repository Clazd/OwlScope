import { z } from "zod";

const OptionalCount = z.number().int().min(0).nullable();

export const MetricSchema = z.object({
  id: z.string(),
  contentId: z.string(),
  impressions: OptionalCount,
  likes: OptionalCount,
  replies: OptionalCount,
  reposts: OptionalCount,
  bookmarks: OptionalCount,
  profileVisits: OptionalCount,
  followersGained: OptionalCount,
  promptedAt: z.string(),
  recordedAt: z.string().nullable(),
  skippedAt: z.string().nullable(),
});
export type Metric = z.infer<typeof MetricSchema>;

export const MetricInputSchema = MetricSchema.pick({
  impressions: true,
  likes: true,
  replies: true,
  reposts: true,
  bookmarks: true,
  profileVisits: true,
  followersGained: true,
});
export type MetricInput = z.infer<typeof MetricInputSchema>;
