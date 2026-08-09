import { z } from "zod";
import { RadarScoreComponentsSchema } from "@/domain/studio/schema";

export const RadarFeedbackSchema = z.object({
  id: z.string(),
  kind: z.literal("radar-dismissal"),
  topicId: z.string(),
  title: z.string(),
  scoreComponents: RadarScoreComponentsSchema.nullable(),
  createdAt: z.string(),
});

export const TodayRejectionFeedbackSchema = z.object({
  id: z.string(),
  kind: z.literal("today-rejection"),
  contentId: z.string(),
  topicId: z.string(),
  reasons: z.array(z.string()),
  note: z.string(),
  createdAt: z.string(),
  undoneAt: z.string().nullable(),
});

export const FeedbackSchema = z.discriminatedUnion("kind", [RadarFeedbackSchema, TodayRejectionFeedbackSchema]);
export type Feedback = z.infer<typeof FeedbackSchema>;
export type RadarFeedback = z.infer<typeof RadarFeedbackSchema>;
export type TodayRejectionFeedback = z.infer<typeof TodayRejectionFeedbackSchema>;
