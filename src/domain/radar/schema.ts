import { z } from "zod";
import { SourceSchema, TopicSchema } from "@/domain/studio/schema";

export const RadarCandidateSchema = z.object({
  key: z.string(),
  title: z.string().min(1),
  summary: z.string(),
  angle: z.string(),
  fitReason: z.string(),
  pillarId: z.string().nullable(),
  kind: z.enum(["fresh", "evergreen", "seed"]),
  sourceResults: z.array(z.object({
    title: z.string(), url: z.string(), domain: z.string(), snippet: z.string(),
    publishedAt: z.string().nullable(), retrievedAt: z.string(), providerId: z.string(),
  })),
});
export type RadarCandidate = z.infer<typeof RadarCandidateSchema>;

export const FastAssessmentSchema = z.object({
  assessments: z.array(z.object({
    key: z.string(),
    personaRelevance: z.number().int().min(0).max(100),
    claimRisk: z.number().int().min(0).max(100),
    pillarId: z.string().nullable(),
    fitReason: z.string(),
  })),
});
export type FastAssessment = z.infer<typeof FastAssessmentSchema>;

export const StrongAssessmentSchema = z.object({
  assessments: z.array(z.object({
    key: z.string(),
    usefulness: z.number().int().min(0).max(100),
    angleStrength: z.number().int().min(0).max(100),
    angle: z.string(),
  })),
});
export type StrongAssessment = z.infer<typeof StrongAssessmentSchema>;

export const EvergreenOutputSchema = z.object({
  ideas: z.array(z.object({
    title: z.string().min(1),
    summary: z.string(),
    angle: z.string(),
    pillarId: z.string().nullable(),
  })).max(12),
});
export type EvergreenOutput = z.infer<typeof EvergreenOutputSchema>;

export const ProviderReportSchema = z.object({
  id: z.string(),
  status: z.enum(["ok", "degraded", "disabled"]),
  resultCount: z.number().int().min(0),
  fromCache: z.boolean().optional(),
  message: z.string(),
});
export type ProviderReport = z.infer<typeof ProviderReportSchema>;

export const SkipResultSchema = z.object({
  recommendation: z.literal("skip"),
  reason: z.string(),
  consideredCount: z.number().int().min(0),
  rejectedFor: z.object({ similar: z.number().int().min(0), weak: z.number().int().min(0) }),
});
export type SkipResult = z.infer<typeof SkipResultSchema>;

export const RadarScanResultSchema = z.object({
  recommendation: z.enum(["topics", "skip"]),
  reason: z.string(),
  consideredCount: z.number().int().min(0),
  rejectedFor: z.object({ similar: z.number().int().min(0), weak: z.number().int().min(0) }),
  topics: z.array(TopicSchema),
  sources: z.array(SourceSchema),
  providers: z.array(ProviderReportSchema),
  runId: z.string(),
});
export type RadarScanResult = z.infer<typeof RadarScanResultSchema>;

export { RadarFeedbackSchema, type RadarFeedback } from "@/domain/feedback/schema";
