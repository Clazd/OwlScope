import "server-only";
import type { Pillar } from "@/domain/persona/schema";
import { AngleKindSchema, type Angle, type AngleKind, type ContentItem, type Topic } from "@/domain/studio/schema";
import { contentStore, topicStore } from "@/domain/studio/store";

export type LengthBand = "short" | "medium" | "long";
export type OpeningPattern = "question" | "number" | "first-person" | "contrast" | "direct-claim";

export interface DiversityDebt {
  dimension: "pillar" | "angle" | "length" | "opening";
  value: string;
  count: number;
  runLength: number;
}

export interface CadenceAnalysis {
  sampleSize: number;
  pillarDistribution: Record<string, number>;
  angleDistribution: Record<string, number>;
  lengthDistribution: Record<LengthBand, number>;
  openingDistribution: Record<OpeningPattern, number>;
  debts: DiversityDebt[];
  desiredAngle: AngleKind | null;
  missionLine: string;
}

function increment(target: Record<string, number>, key: string): void {
  target[key] = (target[key] ?? 0) + 1;
}

export function lengthBand(characterCount: number): LengthBand {
  if (characterCount <= 140) return "short";
  if (characterCount <= 220) return "medium";
  return "long";
}

export function openingPattern(text: string): OpeningPattern {
  const opening = text.trim().split(/(?<=[.!?])\s+/)[0] ?? "";
  if (opening.endsWith("?")) return "question";
  if (/^\d|\b\d+(?:\.\d+)?%?\b/.test(opening)) return "number";
  if (/^(i|i've|i’m|i'm|we|we've|we’re|we're)\b/i.test(opening)) return "first-person";
  if (/\b(?:but|instead|not\s+.+\s+but|the\s+problem)\b/i.test(opening)) return "contrast";
  return "direct-claim";
}

function runLength(values: string[], value: string): number {
  let count = 0;
  for (const current of values) {
    if (current !== value) break;
    count += 1;
  }
  return count;
}

function debtFor(
  dimension: DiversityDebt["dimension"],
  values: string[],
  distribution: Record<string, number>,
  sampleSize: number,
): DiversityDebt | null {
  if (sampleSize < 5 || values.length === 0) return null;
  const [value, count] = Object.entries(distribution).sort((a, b) => b[1] - a[1])[0] ?? [];
  if (!value || !count) return null;
  const streak = runLength(values, value);
  if (streak < 4 && count / sampleSize < 0.6) return null;
  return { dimension, value, count, runLength: streak };
}

export function analyseCadence(
  published: ContentItem[],
  topics: Topic[],
  pillars: Pillar[],
): CadenceAnalysis {
  const recent = [...published]
    .filter((item) => item.status === "published")
    .sort((a, b) => (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt))
    .slice(0, 15);
  const topicById = new Map(topics.map((topic) => [topic.id, topic]));
  const pillarById = new Map(pillars.map((pillar) => [pillar.id, pillar.name]));
  const pillarValues: string[] = [];
  const angleValues: string[] = [];
  const lengthValues: string[] = [];
  const openingValues: string[] = [];
  const pillarDistribution: Record<string, number> = {};
  const angleDistribution: Record<string, number> = {};
  const lengthDistribution: Record<LengthBand, number> = { short: 0, medium: 0, long: 0 };
  const openingDistribution: Record<OpeningPattern, number> = {
    question: 0, number: 0, "first-person": 0, contrast: 0, "direct-claim": 0,
  };

  for (const item of recent) {
    const pillar = pillarById.get(topicById.get(item.topicId)?.pillarId ?? "") ?? "Unassigned";
    const angle = AngleKindSchema.safeParse(item.angle).success ? item.angle : "other";
    const length = lengthBand(item.characterCount);
    const opening = openingPattern(item.text);
    pillarValues.push(pillar);
    angleValues.push(angle);
    lengthValues.push(length);
    openingValues.push(opening);
    increment(pillarDistribution, pillar);
    increment(angleDistribution, angle);
    lengthDistribution[length] += 1;
    openingDistribution[opening] += 1;
  }

  const debts = [
    debtFor("pillar", pillarValues, pillarDistribution, recent.length),
    debtFor("angle", angleValues, angleDistribution, recent.length),
    debtFor("length", lengthValues, lengthDistribution, recent.length),
    debtFor("opening", openingValues, openingDistribution, recent.length),
  ].filter((item): item is DiversityDebt => item !== null);
  const angleDebt = debts.find((debt) => debt.dimension === "angle");
  const kinds = AngleKindSchema.options;
  const desiredAngle = angleDebt
    ? [...kinds].sort((a, b) => (angleDistribution[a] ?? 0) - (angleDistribution[b] ?? 0))[0] ?? null
    : null;
  const missionLine = recent.length < 5
    ? `No diversity correction yet — only ${recent.length} published post${recent.length === 1 ? "" : "s"}.`
    : angleDebt
      ? `Your last ${Math.max(angleDebt.runLength, angleDebt.count)} posts leaned ${angleDebt.value}. Today should make room for ${desiredAngle ?? "a different angle"}, if the evidence supports it.`
      : "Your recent cadence is varied, so no angle correction is needed today.";

  return {
    sampleSize: recent.length,
    pillarDistribution,
    angleDistribution,
    lengthDistribution,
    openingDistribution,
    debts,
    desiredAngle,
    missionLine,
  };
}

export async function loadCadence(pillars: Pillar[]): Promise<CadenceAnalysis> {
  const [content, topics] = await Promise.all([contentStore.list(), topicStore.list()]);
  return analyseCadence(content, topics, pillars);
}

/** A soft 0–100 contribution. Radar's configured weight decides how much it matters. */
export function cadenceDiversityScore(cadence: CadenceAnalysis, pillarId: string | null, pillars: Pillar[]): number {
  if (cadence.sampleSize < 5) return 50;
  const name = pillars.find((pillar) => pillar.id === pillarId)?.name ?? "Unassigned";
  const pillarDebt = cadence.debts.find((debt) => debt.dimension === "pillar");
  if (pillarDebt?.value === name) return 20;
  const count = cadence.pillarDistribution[name] ?? 0;
  return count === 0 ? 85 : Math.max(35, 75 - count * 8);
}

export function pickCadenceAwareAngle(angles: Angle[], cadence: CadenceAnalysis): Angle | null {
  if (angles.length === 0) return null;
  if (cadence.desiredAngle) {
    const correction = angles.find((angle) => angle.kind === cadence.desiredAngle && angle.noveltyRisk !== "high");
    if (correction) return correction;
  }
  return angles.find((angle) => angle.noveltyRisk === "low") ?? angles[0] ?? null;
}
