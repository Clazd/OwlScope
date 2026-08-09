import { z } from "zod";
import { checkReassembly } from "./text";

/**
 * Every contract in the Studio pipeline, in one file.
 *
 * Stage separation is the whole design: the researcher never writes posts, the
 * writer never searches, the critic never rewrites, the validator never
 * invents. Each stage hands the next one a validated document, and these are
 * those documents. If two stages could share a schema, that is usually a sign
 * they are about to be collapsed into one prompt - which is the failure mode.
 */

/* ------------------------------------------------------------------ topic -- */

export const TopicSourceTypeSchema = z.enum(["manual", "radar", "seed", "bank"]);
export type TopicSourceType = z.infer<typeof TopicSourceTypeSchema>;

/** Topic-level freshness. Distinct from the persona's three-way preference. */
export const TopicFreshnessSchema = z.enum(["current", "evergreen"]);
export type TopicFreshness = z.infer<typeof TopicFreshnessSchema>;

export const TopicStatusSchema = z.enum([
  "discovered",
  "researching",
  "ready",
  "used",
  "rejected",
  "insufficient_evidence",
  "banked",
  "stale",
  "dismissed",
]);
export type TopicStatus = z.infer<typeof TopicStatusSchema>;

export const RadarScoreComponentsSchema = z.object({
  personaRelevance: z.number().int().min(0).max(100),
  novelty: z.number().int().min(0).max(100),
  freshness: z.number().int().min(0).max(100),
  sourceQuality: z.number().int().min(0).max(100),
  usefulness: z.number().int().min(0).max(100),
  angleStrength: z.number().int().min(0).max(100),
  claimRisk: z.number().int().min(0).max(100),
  diversityContribution: z.number().int().min(0).max(100),
});
export type RadarScoreComponents = z.infer<typeof RadarScoreComponentsSchema>;

export const RadarKindSchema = z.enum(["fresh", "evergreen", "seed"]);
export type RadarKind = z.infer<typeof RadarKindSchema>;

export const RadarScoreLabelSchema = z.enum(["Excellent", "Strong", "Moderate", "Weak"]);
export type RadarScoreLabel = z.infer<typeof RadarScoreLabelSchema>;

export const TopicSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string(),
  sourceType: TopicSourceTypeSchema,
  /** Null when the topic does not belong to a pillar. Manual topics often do not. */
  pillarId: z.string().nullable(),
  freshness: TopicFreshnessSchema,
  status: TopicStatusSchema,
  /** Anything the user already knows. Passed to research, never treated as evidence. */
  context: z.string(),
  /** Radar's scoring. Null for manual topics. */
  scoreComponents: RadarScoreComponentsSchema.nullable(),
  scoreTotal: z.number().int().min(0).max(100).nullable().optional(),
  scoreLabel: RadarScoreLabelSchema.nullable().optional(),
  radarKind: RadarKindSchema.nullable().optional(),
  angle: z.string().optional(),
  fitReason: z.string().optional(),
  bankedAt: z.string().nullable().optional(),
  bankedUntil: z.string().nullable().optional(),
  dismissedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});
export type Topic = z.infer<typeof TopicSchema>;

/* --------------------------------------------------------------- boundary -- */

/**
 * The boundary check runs before anything else and blocks the topic outright.
 * It is rule 9 enforced structurally: a blocked topic never reaches a writing
 * call, so there is no prompt line for a model to drift past.
 */
export const BoundaryCheckSchema = z.object({
  blocked: z.boolean(),
  /** Ids of the persona boundaries that fired. */
  boundaryIds: z.array(z.string()),
  /** Plain explanation shown to the user. Never a refusal template. */
  explanation: z.string(),
});
export type BoundaryCheck = z.infer<typeof BoundaryCheckSchema>;

/* ---------------------------------------------------------------- sources -- */

export const SourceQualitySchema = z.enum(["primary", "secondary", "aggregator", "forum", "unknown"]);
export type SourceQuality = z.infer<typeof SourceQualitySchema>;

export const SourceSchema = z.object({
  id: z.string().min(1),
  topicId: z.string().min(1),
  title: z.string(),
  url: z.string().min(1),
  domain: z.string(),
  publishedAt: z.string().nullable(),
  retrievedAt: z.string(),
  excerpt: z.string(),
  sourceQuality: SourceQualitySchema,
  providerId: z.string(),
});
export type Source = z.infer<typeof SourceSchema>;

/* --------------------------------------------------------------- research -- */

/**
 * What the researcher produces. Note what is absent: no post, no draft, no
 * angle text longer than a thesis. The researcher does not write.
 */
export const ResearchFindingSchema = z.object({
  claim: z.string().min(1),
  /** Which stored sources carry it. Empty means the model inferred it. */
  sourceIds: z.array(z.string()),
  /** Separating what a source says from what the model concluded. */
  kind: z.enum(["from-source", "inference"]),
});
export type ResearchFinding = z.infer<typeof ResearchFindingSchema>;

export const ResearchOutputSchema = z.object({
  facts: z.array(ResearchFindingSchema),
  uncertainties: z.array(z.string()),
  /** The researcher's read on whether this is still current. */
  freshness: z.object({
    assessment: TopicFreshnessSchema,
    note: z.string(),
  }),
  /** True when the evidence will not carry a factual post. */
  insufficient: z.boolean(),
  insufficientReason: z.string(),
});
export type ResearchOutput = z.infer<typeof ResearchOutputSchema>;

export const ResearchRecordSchema = ResearchOutputSchema.extend({
  sourceIds: z.array(z.string()),
  /** Model-produced URLs that no provider returned. Dropped, and logged here. */
  droppedUrls: z.array(z.string()),
  /** True when every provider was unavailable or returned nothing. */
  noProviders: z.boolean(),
  completedAt: z.string(),
});
export type ResearchRecord = z.infer<typeof ResearchRecordSchema>;

/* ----------------------------------------------------------------- angles -- */

export const AngleKindSchema = z.enum([
  "technical",
  "opinion",
  "explanation",
  "counterintuitive",
  "question",
  "product",
]);
export type AngleKind = z.infer<typeof AngleKindSchema>;

export const AngleSchema = z.object({
  id: z.string().min(1),
  kind: AngleKindSchema,
  thesis: z.string().min(1),
  whyItFits: z.string(),
  evidenceNeeded: z.array(z.string()),
  noveltyRisk: z.enum(["low", "medium", "high"]),
  noveltyNote: z.string(),
});
export type Angle = z.infer<typeof AngleSchema>;

export const AnglesOutputSchema = z.object({
  angles: z.array(AngleSchema).min(1),
});
export type AnglesOutput = z.infer<typeof AnglesOutputSchema>;

/** When the user asks the AI to choose, it shows its reasoning. */
export const AnglePickSchema = z.object({
  angleId: z.string().min(1),
  reasoning: z.string().min(1),
});
export type AnglePick = z.infer<typeof AnglePickSchema>;

/* --------------------------------------------------------- evidence lock -- */

export const ClaimTypeSchema = z.enum(["fact", "inference", "opinion", "rhetorical"]);
export type ClaimType = z.infer<typeof ClaimTypeSchema>;

export const SupportSchema = z.enum(["supported", "partial", "unsupported", "n/a"]);
export type Support = z.infer<typeof SupportSchema>;

/**
 * A draft is an array of sentences, not a blob of text. Everything in this
 * slice depends on it: the validator works per sentence, finalisation is
 * blocked per sentence, and the margin annotates per sentence.
 */
export const SentenceSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  claimType: ClaimTypeSchema,
  sourceIds: z.array(z.string()),
  support: SupportSchema,
});
export type Sentence = z.infer<typeof SentenceSchema>;

/**
 * Exactly what the writer returns.
 *
 * The reassembly check is a schema refinement rather than a later assertion, so
 * a draft whose flattened text disagrees with its own sentences goes down the
 * same road as any other validation failure: one repair attempt with the error
 * fed back, then a clean loud stop. No second mechanism to keep in step.
 */
export const DraftPayloadSchema = z
  .object({
    text: z.string().min(1),
    sentences: z.array(SentenceSchema).min(1),
    toneTags: z.array(z.string()),
  })
  .superRefine((draft, ctx) => {
    const check = checkReassembly(draft.text, draft.sentences);
    if (check.ok) return;
    ctx.addIssue({ code: "custom", path: ["text"], message: check.detail });
  });
export type DraftPayload = z.infer<typeof DraftPayloadSchema>;

export const DraftsOutputSchema = z.object({
  drafts: z.array(DraftPayloadSchema).min(1),
});
export type DraftsOutput = z.infer<typeof DraftsOutputSchema>;

/* ------------------------------------------------------------ similarity -- */

/**
 * Stored so the layers are computed once per content item. If an embedding
 * service is ever added it goes behind `SimilarityService` and these fields
 * gain a sibling - no caller changes.
 */
export const SimilarityVectorsSchema = z.object({
  /** L1: stemmed content tokens of topic and thesis. */
  l1: z.object({ tokens: z.array(z.string()) }),
  /** L2: character trigram counts, with the norms precomputed. */
  l2: z.object({
    trigrams: z.record(z.string(), z.number()),
    norm: z.number(),
    openingTrigrams: z.record(z.string(), z.number()),
    openingNorm: z.number(),
  }),
});
export type SimilarityVectors = z.infer<typeof SimilarityVectorsSchema>;

export const SimilarityMatchSchema = z.object({
  contentId: z.string(),
  /** Which layer produced the score, so a low-confidence hit is legible. */
  layer: z.enum(["l1", "l2", "l3"]),
  score: z.number().min(0).max(1),
  note: z.string(),
});
export type SimilarityMatch = z.infer<typeof SimilarityMatchSchema>;

export const SimilarityResultSchema = z.object({
  risk: z.enum(["low", "medium", "high"]),
  matches: z.array(SimilarityMatchSchema),
  /** True when L3 ran. L1 and L2 are always free. */
  usedModel: z.boolean(),
  /** How many prior posts were compared. L3 never sees more than eight. */
  comparedAgainst: z.number().int().min(0),
});
export type SimilarityResult = z.infer<typeof SimilarityResultSchema>;

export const SimilarityRecordSchema = SimilarityVectorsSchema.extend({
  result: SimilarityResultSchema,
});
export type SimilarityRecord = z.infer<typeof SimilarityRecordSchema>;

/** What L3 is allowed to return. It judges; it never rewrites. */
export const SimilarityJudgementSchema = z.object({
  matches: z.array(
    z.object({
      contentId: z.string(),
      score: z.number().min(0).max(1),
      note: z.string(),
    }),
  ),
});
export type SimilarityJudgement = z.infer<typeof SimilarityJudgementSchema>;

/* ------------------------------------------------------- fact validation -- */

export const ValidationSentenceSchema = z.object({
  id: z.string().min(1),
  support: z.enum(["supported", "partial", "unsupported"]),
  sourceIds: z.array(z.string()),
  notes: z.string(),
});
export type ValidationSentence = z.infer<typeof ValidationSentenceSchema>;

export const ValidationOutputSchema = z.object({
  sentences: z.array(ValidationSentenceSchema),
  canPublish: z.boolean(),
  blockingReasons: z.array(z.string()),
});
export type ValidationOutput = z.infer<typeof ValidationOutputSchema>;

/* --------------------------------------------------------------- critique -- */

export const CritiqueIssueSchema = z.object({
  /** Null for a whole-post issue. Otherwise it links to a sentence. */
  sentenceId: z.string().nullable(),
  severity: z.enum(["block", "warn", "note"]),
  type: z.string().min(1),
  detail: z.string().min(1),
  suggestion: z.string(),
});
export type CritiqueIssue = z.infer<typeof CritiqueIssueSchema>;

/**
 * The critic reports. It does not rewrite, and there is nowhere in this schema
 * to put a rewritten post - that is the enforcement, not a prompt line.
 */
export const CritiqueOutputSchema = z.object({
  personaFit: z.enum(["strong", "acceptable", "weak"]),
  genericness: z.enum(["low", "medium", "high"]),
  factualRisk: z.enum(["low", "medium", "high"]),
  issues: z.array(CritiqueIssueSchema),
  recommendation: z.enum(["accept", "revise", "reject"]),
});
export type CritiqueOutput = z.infer<typeof CritiqueOutputSchema>;

/** The critique as stored: the model's read plus the numbers computed in code. */
export const CritiqueRecordSchema = CritiqueOutputSchema.extend({
  fingerprintScore: z.number().min(0).max(100),
  similarityRisk: z.enum(["low", "medium", "high"]),
});
export type CritiqueRecord = z.infer<typeof CritiqueRecordSchema>;

/* ------------------------------------------------------------------ gates -- */

export const GateFindingSchema = z.object({
  id: z.string().min(1),
  /** Blocking gates stop finalisation. Warnings never do. */
  blocking: z.boolean(),
  message: z.string().min(1),
  /** Set when the finding points at one sentence. */
  sentenceId: z.string().nullable(),
});
export type GateFinding = z.infer<typeof GateFindingSchema>;

export const GateReportSchema = z.object({
  canFinalise: z.boolean(),
  blocking: z.array(GateFindingSchema),
  warnings: z.array(GateFindingSchema),
});
export type GateReport = z.infer<typeof GateReportSchema>;

/* ----------------------------------------------------------- content item -- */

export const ContentStatusSchema = z.enum([
  "draft",
  "reviewing",
  "accepted",
  "published",
  "rejected",
  "archived",
]);
export type ContentStatus = z.infer<typeof ContentStatusSchema>;

/**
 * Recorded when the user finalises past an unsupported factual claim. The
 * override is part of the document, not a flag someone can forget to read.
 */
export const OverrideSchema = z.object({
  reason: z.string(),
  sentenceIds: z.array(z.string()),
  at: z.string(),
});
export type Override = z.infer<typeof OverrideSchema>;

export const ContentItemSchema = z.object({
  id: z.string().min(1),
  topicId: z.string().min(1),
  personaVersion: z.number().int().min(0),
  status: ContentStatusSchema,
  angle: z.string(),
  thesis: z.string(),
  /** Flattened, for copying. The sentences are the source of truth. */
  text: z.string(),
  sentences: z.array(SentenceSchema),
  characterCount: z.number().int().min(0),
  fingerprintScore: z.number().min(0).max(100),
  sourceIds: z.array(z.string()),
  critique: CritiqueRecordSchema.nullable(),
  validation: ValidationOutputSchema.nullable(),
  similarity: SimilarityRecordSchema.nullable(),
  reasoning: z.string(),
  override: OverrideSchema.nullable(),
  /** Free-text reasons from the reject flow. Tunes selection, never identity. */
  rejectionReasons: z.array(z.string()),
  provider: z.string(),
  model: z.string(),
  runId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  publishedAt: z.string().nullable(),
  publicUrl: z.string().nullable(),
});
export type ContentItem = z.infer<typeof ContentItemSchema>;

/* ---------------------------------------------------------------- session -- */

export const STUDIO_STAGES = ["topic", "research", "angles", "drafts", "critique", "final"] as const;
export type StudioStage = (typeof STUDIO_STAGES)[number];

export const StudioStageStateSchema = z.enum(["pending", "active", "done", "failed", "skipped"]);
export type StudioStageState = z.infer<typeof StudioStageStateSchema>;

export const StudioDraftSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  sentences: z.array(SentenceSchema),
  characterCount: z.number().int().min(0),
  toneTags: z.array(z.string()),
  fingerprintScore: z.number().min(0).max(100),
  /**
   * False when there is no fingerprint to score against. Without this a persona
   * that has never been analysed reads as scoring zero, which is the difference
   * between "your voice is wrong" and "nobody has measured your voice".
   */
  fingerprintScored: z.boolean(),
  fingerprintDeviations: z.array(z.string()),
  similarity: SimilarityResultSchema.nullable(),
  /** Non-fatal notes from assembly: a dropped source id, a reassembly repair. */
  warnings: z.array(z.string()),
});
export type StudioDraft = z.infer<typeof StudioDraftSchema>;

/**
 * The working record for one pass through the Studio.
 *
 * It exists so "step backwards without losing work" survives a refresh, and so
 * a partially finished run is resumable rather than being React state that
 * evaporates. It is not the published artefact - that is the content item.
 */
export const StudioSessionSchema = z.object({
  id: z.string().min(1),
  topicId: z.string().min(1),
  stage: z.enum(STUDIO_STAGES),
  stageStates: z.record(z.enum(STUDIO_STAGES), StudioStageStateSchema),
  boundary: BoundaryCheckSchema.nullable(),
  research: ResearchRecordSchema.nullable(),
  angles: z.array(AngleSchema),
  anglePick: AnglePickSchema.nullable(),
  selectedAngleId: z.string().nullable(),
  drafts: z.array(StudioDraftSchema),
  selectedDraftId: z.string().nullable(),
  validation: ValidationOutputSchema.nullable(),
  critique: CritiqueRecordSchema.nullable(),
  reasoning: z.string(),
  contentId: z.string().nullable(),
  /** Every run this session has produced, newest last. Drives the Inspector link. */
  runIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type StudioSession = z.infer<typeof StudioSessionSchema>;
