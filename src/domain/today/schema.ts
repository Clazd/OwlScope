import { z } from "zod";
import { AngleKindSchema } from "@/domain/studio/schema";

export const TodayStageIdSchema = z.enum(["scan", "memory", "research", "angles", "writing", "claims", "reviewing"]);
export type TodayStageId = z.infer<typeof TodayStageIdSchema>;

export const TodayStageSchema = z.object({
  id: TodayStageIdSchema,
  name: z.string(),
  state: z.enum(["pending", "active", "done", "failed", "skipped"]),
  detail: z.string(),
});
export type TodayStage = z.infer<typeof TodayStageSchema>;

export const CadenceSnapshotSchema = z.object({
  sampleSize: z.number().int().min(0),
  pillarDistribution: z.record(z.string(), z.number().int().min(0)),
  angleDistribution: z.record(z.string(), z.number().int().min(0)),
  lengthDistribution: z.record(z.string(), z.number().int().min(0)),
  openingDistribution: z.record(z.string(), z.number().int().min(0)),
  debts: z.array(z.object({ dimension: z.enum(["pillar", "angle", "length", "opening"]), value: z.string(), count: z.number().int(), runLength: z.number().int() })),
  desiredAngle: AngleKindSchema.nullable(),
  missionLine: z.string(),
});

export const TodayRecordSchema = z.object({
  id: z.string(),
  date: z.string(),
  idempotencyKey: z.string(),
  runId: z.string().nullable(),
  status: z.enum(["running", "recommendation", "skip", "failed", "rejected"]),
  mode: z.enum(["balanced", "fresh", "evergreen"]),
  stages: z.array(TodayStageSchema),
  cadence: CadenceSnapshotSchema,
  contentId: z.string().nullable(),
  topicId: z.string().nullable(),
  sessionId: z.string().nullable(),
  candidateIds: z.array(z.string()),
  candidateIndex: z.number().int().min(0),
  consideredCount: z.number().int().min(0),
  rejectedSimilar: z.number().int().min(0),
  rejectedWeak: z.number().int().min(0),
  rejectedCandidates: z.number().int().min(0),
  skipReason: z.string(),
  // `detail` is the diagnosable half of a failure - the schema issues, the head
  // of what the model actually returned. Defaulted so records written before it
  // existed still load.
  failure: z.object({
    stage: TodayStageIdSchema,
    message: z.string(),
    detail: z.string().nullable().default(null),
  }).nullable(),
  copiedAt: z.string().nullable(),
  generatedAt: z.string(),
  updatedAt: z.string(),
});
export type TodayRecord = z.infer<typeof TodayRecordSchema>;

export const TODAY_STAGES: TodayStage[] = [
  { id: "scan", name: "Scanning sources", state: "pending", detail: "" },
  { id: "memory", name: "Checking against memory", state: "pending", detail: "" },
  { id: "research", name: "Researching the candidate", state: "pending", detail: "" },
  { id: "angles", name: "Generating angles", state: "pending", detail: "" },
  { id: "writing", name: "Writing", state: "pending", detail: "" },
  { id: "claims", name: "Checking claims", state: "pending", detail: "" },
  { id: "reviewing", name: "Reviewing", state: "pending", detail: "" },
];
