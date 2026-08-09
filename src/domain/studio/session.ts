import "server-only";
import type { ExperienceItem, Fingerprint, Persona } from "@/domain/persona/schema";
import { readExperience, readFingerprint, readPersonaOrEmpty } from "@/domain/persona/store";
import { newId } from "@/lib/ids";
import { getProvider } from "@/services/ai/provider";
import { startRun, type Recorder } from "@/services/runs/recorder";
import { MEMORY_LIMIT } from "./prompts";
import {
  STUDIO_STAGES,
  type ContentItem,
  type StudioSession,
  type StudioStage,
  type StudioStageState,
  type Topic,
} from "./schema";
import { contentHistory, sessionStore, topicStore } from "./store";

/**
 * The working record for one pass through the Studio.
 *
 * It exists so that "the user can enter at any stage and step backwards without
 * losing work" survives a refresh. React state would satisfy the sentence right
 * up until someone reloads the page halfway through a critique they paid for.
 */

export function emptyStageStates(): Record<StudioStage, StudioStageState> {
  return {
    topic: "pending",
    research: "pending",
    angles: "pending",
    drafts: "pending",
    critique: "pending",
    final: "pending",
  };
}

export async function createSession(topic: Topic): Promise<StudioSession> {
  const now = new Date().toISOString();
  return sessionStore.put({
    id: newId(),
    topicId: topic.id,
    stage: "topic",
    stageStates: { ...emptyStageStates(), topic: "active" },
    boundary: null,
    research: null,
    angles: [],
    anglePick: null,
    selectedAngleId: null,
    drafts: [],
    selectedDraftId: null,
    validation: null,
    critique: null,
    reasoning: "",
    contentId: null,
    runIds: [],
    createdAt: now,
    updatedAt: now,
  });
}

export async function readSession(id: string): Promise<StudioSession | null> {
  return sessionStore.get(id);
}

export async function saveSession(session: StudioSession): Promise<StudioSession> {
  return sessionStore.put({ ...session, updatedAt: new Date().toISOString() });
}

/**
 * Moving to a stage marks it active and everything before it done - but never
 * clears what a later stage already produced. Stepping back to Angles and
 * forward again must not silently throw away three drafts the user paid for.
 */
export function enterStage(session: StudioSession, stage: StudioStage): StudioSession {
  const target = STUDIO_STAGES.indexOf(stage);
  const stageStates = { ...session.stageStates };
  STUDIO_STAGES.forEach((name, index) => {
    if (index < target && stageStates[name] === "pending") stageStates[name] = "skipped";
    if (index === target) stageStates[name] = "active";
  });
  return { ...session, stage, stageStates };
}

export function markStage(
  session: StudioSession,
  stage: StudioStage,
  state: StudioStageState,
): StudioSession {
  return { ...session, stageStates: { ...session.stageStates, [stage]: state } };
}

/**
 * Later stages depend on earlier output, so invalidating one has to invalidate
 * what came after it. Anything else leaves a critique of a draft that no longer
 * exists sitting on screen looking authoritative.
 */
export function invalidateFrom(session: StudioSession, stage: StudioStage): StudioSession {
  const from = STUDIO_STAGES.indexOf(stage);
  const stageStates = { ...session.stageStates };
  for (let i = from; i < STUDIO_STAGES.length; i += 1) {
    stageStates[STUDIO_STAGES[i] as StudioStage] = "pending";
  }

  const next: StudioSession = { ...session, stageStates };
  if (from <= STUDIO_STAGES.indexOf("angles")) {
    next.angles = [];
    next.anglePick = null;
    next.selectedAngleId = null;
  }
  if (from <= STUDIO_STAGES.indexOf("drafts")) {
    next.drafts = [];
    next.selectedDraftId = null;
  }
  if (from <= STUDIO_STAGES.indexOf("critique")) {
    next.validation = null;
    next.critique = null;
  }
  if (from <= STUDIO_STAGES.indexOf("final")) {
    next.reasoning = "";
    next.contentId = null;
  }
  return next;
}

/* ---------------------------------------------------------- shared context -- */

export interface StudioContext {
  persona: Persona;
  fingerprint: Fingerprint | null;
  experience: ExperienceItem[];
  history: ContentItem[];
  recentPosts: Array<{ text: string; createdAt: string }>;
}

/**
 * Everything a stage might need about the writer, read once.
 *
 * `recentPosts` is capped here rather than at each call site, so no prompt can
 * accidentally carry the whole archive - the cap is a property of the loader.
 */
export async function loadContext(): Promise<StudioContext> {
  const [persona, fingerprint, experience, history] = await Promise.all([
    readPersonaOrEmpty(),
    readFingerprint(),
    readExperience(),
    contentHistory(),
  ]);

  return {
    persona,
    fingerprint,
    experience,
    history,
    recentPosts: history
      .slice(0, MEMORY_LIMIT)
      .map((item) => ({ text: item.text, createdAt: item.createdAt })),
  };
}

export async function readTopic(id: string): Promise<Topic | null> {
  return topicStore.get(id);
}

/* -------------------------------------------------------------------- runs -- */

export interface RunHandle {
  recorder: Recorder;
  sandbox: boolean;
  provider: string;
  models: { strong: string; fast: string };
}

/**
 * One run per user action, not one per session. A run is "what the user asked
 * for and what it cost", and the Inspector is much easier to read when
 * "generate drafts" is one row rather than a fragment of an hour-long entry.
 */
export async function beginRun(
  personaVersion: number,
  idempotencyKey: string | null,
): Promise<RunHandle> {
  const resolved = await getProvider();
  const recorder = await startRun({
    kind: "studio",
    personaVersion,
    sandbox: resolved.sandbox,
    idempotencyKey,
  });
  return {
    recorder,
    sandbox: resolved.sandbox,
    provider: resolved.provider.name,
    models: { strong: resolved.models.strong, fast: resolved.models.fast },
  };
}

export function withRun(session: StudioSession, runId: string): StudioSession {
  return session.runIds.includes(runId) ? session : { ...session, runIds: [...session.runIds, runId] };
}
