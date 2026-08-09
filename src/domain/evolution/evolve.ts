import "server-only";
import { feedbackStore } from "@/domain/feedback/store";
import { readSnapshot } from "@/domain/persona/store";
import { saveAsNewVersion } from "@/domain/persona/versions";
import { suggestionStore } from "./store";
import type { EvolutionTarget, PersonaSuggestion } from "./schema";

export const MIN_EVOLUTION_EVENTS = 15;

interface Candidate {
  target: EvolutionTarget;
  currentValue: number;
  proposedValue: number;
  evidence: string;
}

export async function analyseEvolution(now = new Date()): Promise<{ eventCount: number; suggestion: PersonaSuggestion | null; reason: string }> {
  const [feedback, snapshot, existing] = await Promise.all([feedbackStore.list(), readSnapshot(), suggestionStore.list()]);
  if (feedback.length < MIN_EVOLUTION_EVENTS) {
    return { eventCount: feedback.length, suggestion: null, reason: `At least ${MIN_EVOLUTION_EVENTS} feedback events are required; ${feedback.length} are available.` };
  }
  const candidate = chooseCandidate(feedback.flatMap((item) => item.kind === "today-rejection" ? item.reasons : []), snapshot.persona.sliders);
  if (!candidate) return { eventCount: feedback.length, suggestion: null, reason: "The feedback does not support a specific numeric change." };
  const previous = existing.find((item) => item.target === candidate.target);
  if (previous?.status === "suppressed" || (previous?.declines ?? 0) >= 3) {
    return { eventCount: feedback.length, suggestion: null, reason: "The supported change was previously declined three times or suppressed." };
  }
  const stamp = now.toISOString();
  const suggestion = await suggestionStore.put({
    id: candidate.target.replace(/\./g, "-"),
    ...candidate,
    status: "pending",
    declines: previous?.declines ?? 0,
    createdAt: previous?.createdAt ?? stamp,
    updatedAt: stamp,
    resolvedAt: null,
    personaVersion: null,
  });
  return { eventCount: feedback.length, suggestion, reason: "One specific change is ready for review." };
}

export async function resolveSuggestion(id: string, action: "accept" | "reject" | "suppress", modifiedValue?: number): Promise<PersonaSuggestion> {
  const suggestion = await suggestionStore.get(id);
  if (!suggestion) throw new Error("That evolution suggestion no longer exists.");
  const now = new Date().toISOString();
  if (action === "reject" || action === "suppress") {
    return suggestionStore.put({ ...suggestion, status: action === "suppress" ? "suppressed" : "rejected", declines: action === "reject" ? suggestion.declines + 1 : suggestion.declines, updatedAt: now, resolvedAt: now });
  }
  const value = clamp(modifiedValue ?? suggestion.proposedValue);
  const snapshot = await readSnapshot();
  const slider = suggestion.target.split(".")[1] as keyof typeof snapshot.persona.sliders;
  const next = { ...snapshot, persona: { ...snapshot.persona, sliders: { ...snapshot.persona.sliders, [slider]: value } } };
  const saved = await saveAsNewVersion(next, `Accepted evolution suggestion ${suggestion.id}: ${slider} ${suggestion.currentValue} → ${value}`);
  return suggestionStore.put({ ...suggestion, proposedValue: value, status: "accepted", updatedAt: now, resolvedAt: now, personaVersion: saved.version.version });
}

function chooseCandidate(reasons: readonly string[], sliders: { technicalAccessible: number; casualFormal: number; conciseDetailed: number }): Candidate | null {
  const counts = new Map<string, number>();
  for (const reason of reasons) counts.set(reason.toLowerCase(), (counts.get(reason.toLowerCase()) ?? 0) + 1);
  const generic = (counts.get("too generic") ?? 0) + (counts.get("sounds like ai") ?? 0) + (counts.get("boring") ?? 0);
  const formal = counts.get("too formal") ?? 0;
  const long = counts.get("too long") ?? 0;
  const best = Math.max(generic, formal, long);
  if (best < 3) return null;
  if (best === generic) return { target: "sliders.technicalAccessible", currentValue: sliders.technicalAccessible, proposedValue: clamp(sliders.technicalAccessible - 15), evidence: `${generic} rejection labels called the work generic, AI-sounding, or boring. Suggested: Technical ↔ Accessible ${sliders.technicalAccessible} → ${clamp(sliders.technicalAccessible - 15)}.` };
  if (best === formal) return { target: "sliders.casualFormal", currentValue: sliders.casualFormal, proposedValue: clamp(sliders.casualFormal - 15), evidence: `${formal} rejections said “too formal.” Suggested: Casual ↔ Formal ${sliders.casualFormal} → ${clamp(sliders.casualFormal - 15)}.` };
  return { target: "sliders.conciseDetailed", currentValue: sliders.conciseDetailed, proposedValue: clamp(sliders.conciseDetailed - 15), evidence: `${long} rejections said “too long.” Suggested: Concise ↔ Detailed ${sliders.conciseDetailed} → ${clamp(sliders.conciseDetailed - 15)}.` };
}

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
