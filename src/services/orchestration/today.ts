import "server-only";
import { scoreAgainstFingerprint } from "@/domain/persona/fingerprint";
import { readPersonaOrEmpty } from "@/domain/persona/store";
import { runRadarScan, type RadarProgressEvent } from "@/domain/radar/scan";
import { runBoundaryCheck } from "@/domain/studio/boundary";
import { runAngles } from "@/domain/studio/angles";
import { runCritique } from "@/domain/studio/critique";
import { createContentItem, runReasoning, transitionContent } from "@/domain/studio/finalise";
import { evaluateGates } from "@/domain/studio/gates";
import { runResearch } from "@/domain/studio/research";
import {
  createSession,
  enterStage,
  loadContext,
  markStage,
  readSession,
  saveSession,
  withRun,
} from "@/domain/studio/session";
import { checkSimilarity } from "@/domain/studio/similarity";
import type { StudioDraft, StudioSession, Topic, ValidationOutput } from "@/domain/studio/schema";
import { sourcesByIds, topicStore } from "@/domain/studio/store";
import { runValidation } from "@/domain/studio/validate";
import { invitesFirstHandClaim, runDrafts } from "@/domain/studio/write";
import { X_LIMIT } from "@/domain/studio/text";
import { cadenceDiversityScore, loadCadence, pickCadenceAwareAngle } from "@/domain/today/cadence";
import { TODAY_STAGES, type TodayRecord, type TodayStageId } from "@/domain/today/schema";
import { todayStore } from "@/domain/today/store";
import { dateKey } from "@/lib/ids";
import { getProvider } from "@/services/ai/provider";
import { finishInterruptedRun, startRun, type Recorder } from "@/services/runs/recorder";

export type TodayMode = "balanced" | "fresh" | "evergreen";

export interface StartTodayOptions {
  idempotencyKey: string;
  mode?: TodayMode;
  replace?: boolean;
  retry?: boolean;
  now?: Date;
}

const jobs = new Map<string, Promise<void>>();

function cloneStages() {
  return TODAY_STAGES.map((stage) => ({ ...stage }));
}

function stageId(record: TodayRecord): TodayStageId {
  return record.failure?.stage
    ?? record.stages.find((stage) => stage.state === "active")?.id
    ?? "scan";
}

async function updateStage(
  record: TodayRecord,
  id: TodayStageId,
  state: TodayRecord["stages"][number]["state"],
  detail: string,
): Promise<TodayRecord> {
  const target = record.stages.findIndex((stage) => stage.id === id);
  const stages = record.stages.map((stage, index) => {
    if (stage.id === id) return { ...stage, state, detail };
    if (state === "active" && index > target) return { ...stage, state: "pending" as const, detail: "" };
    if (state === "active" && stage.state === "active") return { ...stage, state: "done" as const };
    return stage;
  });
  return todayStore.put({ ...record, stages, updatedAt: new Date().toISOString(), failure: state === "failed" ? record.failure : null });
}

async function skipRemaining(record: TodayRecord): Promise<TodayRecord> {
  const stages = record.stages.map((stage) =>
    stage.state === "pending" || stage.state === "active" ? { ...stage, state: "skipped" as const, detail: "No candidate continued." } : stage,
  );
  return todayStore.put({ ...record, stages, updatedAt: new Date().toISOString() });
}

function reorder(topics: Topic[], mode: TodayMode): Topic[] {
  if (mode === "balanced") return topics;
  const wanted = mode === "fresh" ? "fresh" : "evergreen";
  return [...topics].sort((a, b) => Number(b.radarKind === wanted) - Number(a.radarKind === wanted));
}

function applyValidation(draft: StudioDraft, validation: ValidationOutput): StudioDraft {
  const verdicts = new Map(validation.sentences.map((verdict) => [verdict.id, verdict]));
  return {
    ...draft,
    sentences: draft.sentences.map((sentence) => {
      const verdict = verdicts.get(sentence.id);
      if (!verdict) return sentence;
      return {
        ...sentence,
        support: sentence.claimType === "opinion" || sentence.claimType === "rhetorical" ? "n/a" as const : verdict.support,
        sourceIds: verdict.sourceIds.length > 0 ? verdict.sourceIds : sentence.sourceIds,
      };
    }),
  };
}

async function saveCandidateSession(record: TodayRecord, session: StudioSession): Promise<TodayRecord> {
  const saved = await saveSession(session);
  return todayStore.put({
    ...record,
    sessionId: saved.id,
    topicId: saved.topicId,
    updatedAt: new Date().toISOString(),
  });
}

async function runCandidate(
  record: TodayRecord,
  topic: Topic,
  recorder: Recorder,
): Promise<{ record: TodayRecord; accepted: boolean }> {
  const context = await loadContext();
  const resolvedProvider = await getProvider();
  let session = record.sessionId ? await readSession(record.sessionId) : null;
  if (!session || session.topicId !== topic.id) {
    const boundary = await runBoundaryCheck({
      title: topic.title,
      summary: topic.summary,
      boundaries: context.persona.boundaries,
      recorder,
    });
    session = await createSession(topic);
    session = withRun({ ...session, boundary }, recorder.id);
    session = boundary.blocked
      ? markStage(session, "topic", "failed")
      : markStage(enterStage(session, "research"), "topic", "done");
    session = await saveSession(session);
    record = await saveCandidateSession(record, session);
    if (boundary.blocked) return { record, accepted: false };
  }
  if (!session) throw new Error("The candidate session could not be created.");

  record = await updateStage(record, "research", "active", `Candidate ${record.candidateIndex + 1} of ${Math.min(3, record.candidateIds.length)}`);
  if (!session.research) {
    const research = await runResearch({ topic, recorder });
    session = await saveSession(withRun({ ...session, research: research.record }, recorder.id));
  }
  const researchRecord = session.research;
  if (!researchRecord) throw new Error("Research completed without a stored record.");
  session = topic.freshness === "current" && researchRecord.insufficient
    ? markStage(session, "research", "failed")
    : markStage(enterStage(session, "angles"), "research", "done");
  session = await saveSession(session);
  record = await updateStage(record, "research", "done", `${researchRecord.sourceIds.length} sources, ${researchRecord.facts.length} checked facts`);
  if (topic.freshness === "current" && researchRecord.insufficient) {
    await topicStore.put({ ...topic, status: "insufficient_evidence", updatedAt: new Date().toISOString() });
    return { record, accepted: false };
  }
  const sources = await sourcesByIds(researchRecord.sourceIds);

  record = await updateStage(record, "angles", "active", "Looking for meaningfully different arguments");
  if (session.angles.length === 0) {
    const angles = await runAngles({
      topic,
      research: researchRecord,
      sources,
      persona: context.persona,
      recentPosts: context.recentPosts,
      experience: context.experience,
      recorder,
    });
    session = await saveSession(withRun({ ...session, angles }, recorder.id));
  }
  const selectedAngleId = session.selectedAngleId;
  const selectedAngle = session.angles.find((angle) => angle.id === selectedAngleId)
    ?? pickCadenceAwareAngle(session.angles, record.cadence);
  if (!selectedAngle) return { record, accepted: false };
  if (!session.selectedAngleId) {
    session = await saveSession({
      ...session,
      selectedAngleId: selectedAngle.id,
      anglePick: {
        angleId: selectedAngle.id,
        reasoning: record.cadence.desiredAngle === selectedAngle.kind
          ? `Your recent cadence created ${record.cadence.desiredAngle} debt. I chose this angle because it corrects that without forcing a weaker topic.`
          : `I chose the lowest-novelty-risk angle that the evidence can carry. ${record.cadence.missionLine}`,
      },
    });
  }
  session = markStage(enterStage(session, "drafts"), "angles", "done");
  session = await saveSession(session);
  record = await updateStage(record, "angles", "done", `${session.angles.length} angles · chose ${selectedAngle.kind}`);

  record = await updateStage(record, "writing", "active", "Producing three alternatives");
  if (session.drafts.length === 0) {
    const drafts = await runDrafts({
      topic,
      angle: selectedAngle,
      research: researchRecord,
      sources,
      persona: context.persona,
      fingerprint: context.fingerprint,
      experience: invitesFirstHandClaim(topic, selectedAngle) ? context.experience : null,
      recentPosts: context.recentPosts,
      count: 3,
      recorder,
    });
    session = await saveSession(withRun({ ...session, drafts }, recorder.id));
  }
  session = markStage(enterStage(session, "critique"), "drafts", "done");
  session = await saveSession(session);
  record = await updateStage(record, "writing", "done", `${session.drafts.length} drafts`);

  const selectedDraftId = session.selectedDraftId;
  const orderedDrafts = [...session.drafts].sort((a, b) => {
    const lengthOrder = Number(a.characterCount > X_LIMIT) - Number(b.characterCount > X_LIMIT);
    if (lengthOrder !== 0) return lengthOrder;
    if (!selectedDraftId) return 0;
    return Number(b.id === selectedDraftId) - Number(a.id === selectedDraftId);
  });
  for (const [draftIndex, originalDraft] of orderedDrafts.entries()) {
    session = await saveSession(enterStage({ ...session, selectedDraftId: originalDraft.id }, "critique"));
    record = await updateStage(record, "claims", "active", `Draft ${draftIndex + 1} of ${orderedDrafts.length}`);
    if (originalDraft.characterCount > X_LIMIT) {
      record = await updateStage(record, "claims", "done", `Draft is ${originalDraft.characterCount} characters; limit is ${X_LIMIT}`);
      record = await updateStage(record, "reviewing", "active", `Draft ${draftIndex + 1} failed the length gate; trying the next`);
      continue;
    }
    const validation = await runValidation({ sentences: originalDraft.sentences, sources, recorder });
    let draft = applyValidation(originalDraft, validation);
    session = await saveSession({
      ...session,
      drafts: session.drafts.map((entry) => entry.id === originalDraft.id ? draft : entry),
      validation,
      critique: null,
    });
    record = await updateStage(record, "claims", "done", validation.canPublish ? "All factual claims carried" : `${validation.blockingReasons.length} unsupported claim${validation.blockingReasons.length === 1 ? "" : "s"}`);

    // A critique cannot repair unsupported evidence. Try the next generated
    // draft instead of paying to review text the hard gates cannot accept.
    if (!validation.canPublish) {
      record = await updateStage(record, "reviewing", "active", `Draft ${draftIndex + 1} failed claim support; trying the next`);
      continue;
    }

    record = await updateStage(record, "reviewing", "active", `Reviewing draft ${draftIndex + 1}`);
    const similarity = await checkSimilarity({
      candidate: { id: "", text: draft.text, topic: topic.title, thesis: selectedAngle.thesis },
      history: context.history,
      recorder,
    });
    draft = { ...draft, similarity: similarity.result };
    session = await saveSession({
      ...session,
      drafts: session.drafts.map((entry) => entry.id === originalDraft.id ? draft : entry),
    });
    const critique = await runCritique({
      text: draft.text,
      sentences: draft.sentences,
      sources,
      validation,
      similarity: similarity.result,
      persona: context.persona,
      fingerprint: context.fingerprint,
      experience: context.experience,
      recentPosts: context.recentPosts,
      recorder,
    });
    session = await saveSession(markStage({ ...session, critique }, "critique", "done"));
    const scored = scoreAgainstFingerprint(draft.text, context.fingerprint);
    const gates = evaluateGates({
      sentences: draft.sentences,
      characterCount: draft.characterCount,
      validation,
      critique,
      similarity: similarity.result,
      fingerprintScore: draft.fingerprintScore,
      fingerprintScored: draft.fingerprintScored,
      fingerprintDeviations: scored.deviations,
      boundaryBlocked: session.boundary?.blocked ?? false,
      boundaryExplanation: session.boundary?.explanation ?? "",
      staleAsCurrent: topic.freshness === "current" && researchRecord.insufficient,
      overriddenSentenceIds: [],
    });
    if (!gates.canFinalise) {
      record = await updateStage(record, "reviewing", "active", `Draft ${draftIndex + 1} failed ${gates.blocking.length} gate${gates.blocking.length === 1 ? "" : "s"}; trying the next`);
      continue;
    }

    const reasoning = await runReasoning({
      topic,
      angle: selectedAngle,
      draft,
      research: researchRecord,
      sources,
      similarity,
      recentPosts: context.recentPosts,
      recorder,
    });
    let content = await createContentItem({
      topic,
      angle: selectedAngle,
      draft,
      persona: context.persona,
      validation,
      critique,
      similarity,
      reasoning,
      override: null,
      provider: resolvedProvider.provider.name,
      model: resolvedProvider.models.strong,
      runId: recorder.id,
    });
    content = await transitionContent({ contentId: content.id, to: "reviewing" });
    content = await transitionContent({ contentId: content.id, to: "accepted" });
    await topicStore.put({ ...topic, status: "used", updatedAt: new Date().toISOString() });
    session = withRun(markStage({ ...session, reasoning, contentId: content.id }, "critique", "done"), recorder.id);
    session = markStage(enterStage(session, "final"), "final", "done");
    session = await saveSession(session);
    record = await updateStage(record, "reviewing", "done", `Accepted draft ${draftIndex + 1} · ${content.characterCount} characters`);
    record = await todayStore.put({
      ...record,
      status: "recommendation",
      contentId: content.id,
      topicId: topic.id,
      sessionId: session.id,
      failure: null,
      updatedAt: new Date().toISOString(),
    });
    return { record, accepted: true };
  }
  session = await saveSession(markStage(session, "critique", "failed"));
  return { record, accepted: false };
}

async function execute(initial: TodayRecord, recorder: Recorder): Promise<void> {
  let record = initial;
  try {
    const persona = await readPersonaOrEmpty();
    if (record.candidateIds.length === 0) {
      record = await updateStage(record, "scan", "active", "Opening configured sources");
      let providerCount = 0;
      let resultCount = 0;
      const progress = async (event: RadarProgressEvent) => {
        if (event.phase === "provider") {
          providerCount += event.report.status === "disabled" ? 0 : 1;
          resultCount += event.report.resultCount;
          record = await updateStage(record, "scan", "active", `${resultCount} candidates from ${providerCount} source${providerCount === 1 ? "" : "s"}`);
        } else if (event.stage === "novelty") {
          record = await updateStage(record, "memory", "active", event.detail);
        }
      };
      const radar = await runRadarScan(null, progress, {
        recorder,
        diversityContribution: (pillarId) => cadenceDiversityScore(record.cadence, pillarId, persona.pillars),
      });
      const candidates = reorder(radar.topics, record.mode).slice(0, 3);
      record = await updateStage(record, "scan", "done", `${radar.consideredCount} candidates from ${radar.providers.filter((provider) => provider.status === "ok").length} sources`);
      record = await updateStage(record, "memory", "done", `${candidates.length} survived · ${radar.rejectedFor.similar} too similar`);
      record = await todayStore.put({
        ...record,
        candidateIds: candidates.map((topic) => topic.id),
        consideredCount: radar.consideredCount,
        rejectedSimilar: radar.rejectedFor.similar,
        rejectedWeak: radar.rejectedFor.weak,
        skipReason: radar.reason,
        updatedAt: new Date().toISOString(),
      });
      if (radar.recommendation === "skip" || candidates.length === 0) {
        record = await skipRemaining(record);
        await todayStore.put({ ...record, status: "skip", skipReason: radar.reason, updatedAt: new Date().toISOString() });
        await recorder.finish("done");
        return;
      }
    }

    for (let index = record.candidateIndex; index < Math.min(3, record.candidateIds.length); index += 1) {
      const topic = await topicStore.get(record.candidateIds[index] as string);
      record = await todayStore.put({
        ...record,
        candidateIndex: index,
        topicId: topic?.id ?? null,
        sessionId: record.topicId === topic?.id ? record.sessionId : null,
        updatedAt: new Date().toISOString(),
      });
      if (!topic) {
        record = await todayStore.put({ ...record, rejectedCandidates: record.rejectedCandidates + 1 });
        continue;
      }
      const result = await runCandidate(record, topic, recorder);
      record = result.record;
      if (result.accepted) {
        await recorder.finish("done");
        return;
      }
      record = await todayStore.put({
        ...record,
        rejectedCandidates: record.rejectedCandidates + 1,
        candidateIndex: index + 1,
        sessionId: null,
        updatedAt: new Date().toISOString(),
      });
    }

    record = await skipRemaining(record);
    const explanation = `I looked at ${record.consideredCount} things. ${record.rejectedSimilar} were already too close to your recent posts. I tried the ${record.rejectedCandidates} strongest candidate${record.rejectedCandidates === 1 ? "" : "s"}, and none survived the evidence and quality gates. Posting one would be filler.`;
    await todayStore.put({ ...record, status: "skip", skipReason: explanation, failure: null, updatedAt: new Date().toISOString() });
    await recorder.finish("done");
  } catch (error) {
    // runCandidate saves progress before it returns. When it throws, reload that
    // progress before naming the failure or a research/angle error looks like a
    // scan error in Today.
    record = await todayStore.get(record.id) ?? record;
    const failedStage = stageId(record);
    const message = error instanceof Error ? error.message : String(error);
    const detail = (error as { detail?: string }).detail ?? null;
    await recorder.recordFailure(`today:${failedStage}`, "none", "", error);
    await recorder.finish("failed");
    const stages = record.stages.map((stage) => stage.id === failedStage ? { ...stage, state: "failed" as const, detail: "Failed" } : stage);
    await todayStore.put({
      ...record,
      status: "failed",
      stages,
      failure: { stage: failedStage, message, detail },
      updatedAt: new Date().toISOString(),
    });
  }
}

export async function readToday(now: Date = new Date()): Promise<TodayRecord | null> {
  return todayStore.get(dateKey(now));
}

/**
 * A dev-server restart can leave a durable record saying "running" after the
 * only process capable of finishing it has disappeared. Turn that into an
 * actionable retry state instead of letting the browser poll forever.
 */
export async function recoverInterruptedToday(now: Date = new Date()): Promise<TodayRecord | null> {
  const record = await readToday(now);
  if (!record || record.status !== "running" || jobs.has(record.date)) return record;
  const failedStage = stageId(record);
  const message = "The previous run was interrupted. Retry from this stage.";
  const stages = record.stages.map((stage) => stage.id === failedStage
    ? { ...stage, state: "failed" as const, detail: "Failed" }
    : stage.state === "active" ? { ...stage, state: "pending" as const, detail: "" } : stage);
  if (record.runId) await finishInterruptedRun(record.runId);
  return todayStore.put({
    ...record,
    status: "failed",
    stages,
    failure: { stage: failedStage, message, detail: null },
    updatedAt: new Date().toISOString(),
  });
}

export async function startToday(options: StartTodayOptions): Promise<TodayRecord> {
  const now = options.now ?? new Date();
  const date = dateKey(now);
  const current = await todayStore.get(date);
  const activeJob = jobs.get(date);
  if (activeJob) {
    if (current) return current;
    // A concurrent request can arrive after the in-memory lock is installed
    // but before the initial day record reaches disk. The placeholder resolves
    // as soon as that record exists, so both requests attach to one run.
    await activeJob;
    const attached = await todayStore.get(date);
    if (attached) return attached;
  }
  if (current && !options.replace && !options.retry) return current;

  let releaseStart!: () => void;
  const placeholder = new Promise<void>((resolve) => { releaseStart = resolve; });
  jobs.set(date, placeholder);
  try {
    const [persona, resolved] = await Promise.all([readPersonaOrEmpty(), getProvider()]);
    const cadence = await loadCadence(persona.pillars);
    const recorder = await startRun({
      kind: "today",
      personaVersion: persona.activeVersion,
      sandbox: resolved.sandbox,
      idempotencyKey: options.idempotencyKey,
    });
    const timestamp = now.toISOString();
    const retrying = Boolean(options.retry && current);
    const record = await todayStore.put(retrying ? {
      ...current!,
      idempotencyKey: options.idempotencyKey,
      runId: recorder.id,
      status: "running",
      failure: null,
      stages: current!.stages.map((stage) => stage.state === "failed" ? { ...stage, state: "active" as const, detail: "Retrying from here" } : stage),
      updatedAt: timestamp,
    } : {
      id: date,
      date,
      idempotencyKey: options.idempotencyKey,
      runId: recorder.id,
      status: "running",
      mode: options.mode ?? "balanced",
      stages: cloneStages().map((stage, index) => index === 0 ? { ...stage, state: "active" as const, detail: "Opening configured sources" } : stage),
      cadence,
      contentId: null,
      topicId: null,
      sessionId: null,
      candidateIds: [],
      candidateIndex: 0,
      consideredCount: 0,
      rejectedSimilar: 0,
      rejectedWeak: 0,
      rejectedCandidates: 0,
      skipReason: "",
      failure: null,
      copiedAt: null,
      generatedAt: timestamp,
      updatedAt: timestamp,
    });
    const job = execute(record, recorder).finally(() => jobs.delete(date));
    jobs.set(date, job);
    releaseStart();
    return record;
  } catch (error) {
    jobs.delete(date);
    releaseStart();
    throw error;
  }
}

export async function waitForToday(date: string): Promise<void> {
  await jobs.get(date);
}
