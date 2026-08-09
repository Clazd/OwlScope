import type { RadarSettings } from "@/domain/settings/schema";
import type { RadarScoreComponents, RadarScoreLabel, SourceQuality } from "@/domain/studio/schema";
import type { SearchResult } from "@/services/search/provider";

export function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
}

export function scoreLabel(score: number): RadarScoreLabel {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Strong";
  if (score >= 50) return "Moderate";
  return "Weak";
}

export function meetsThreshold(score: number, threshold: number): boolean {
  return clampScore(score) >= clampScore(threshold);
}

export function weightedScore(
  components: RadarScoreComponents,
  weights: RadarSettings["weights"],
  ignored: readonly (keyof RadarScoreComponents)[] = [],
): number {
  const skip = new Set(ignored);
  const entries = (Object.entries(weights) as Array<[keyof RadarScoreComponents, number]>).filter(([key]) => !skip.has(key));
  const denominator = entries.reduce((sum, [, weight]) => sum + Math.max(0, weight), 0);
  if (denominator === 0) return 0;
  return clampScore(entries.reduce((sum, [key, weight]) => sum + components[key] * Math.max(0, weight), 0) / denominator);
}

export function freshnessScore(sources: readonly SearchResult[], now = Date.now()): number {
  const dates = sources.map((source) => source.publishedAt ? new Date(source.publishedAt).getTime() : NaN).filter(Number.isFinite);
  if (dates.length === 0) return 35;
  const hours = Math.max(0, (now - Math.max(...dates)) / 3600000);
  if (hours <= 6) return 100;
  if (hours <= 24) return 90;
  if (hours <= 72) return 75;
  if (hours <= 168) return 55;
  if (hours <= 720) return 35;
  return 15;
}

export function sourceQualityScore(qualities: readonly SourceQuality[], domains: readonly string[] = []): number {
  const value: Record<SourceQuality, number> = { primary: 100, secondary: 80, aggregator: 55, forum: 45, unknown: 35 };
  if (!qualities.length) return 30;
  const base = Math.max(...qualities.map((quality) => value[quality]));
  const independentDomains = new Set(domains.map((domain) => domain.toLowerCase()).filter(Boolean)).size;
  const corroborationBonus = Math.min(15, Math.max(0, independentDomains - 1) * 5);
  return clampScore(base + corroborationBonus);
}

export function noveltyFromMatches(matches: readonly { score: number }[]): number {
  return clampScore(100 - Math.max(0, ...matches.map((match) => match.score * 100)));
}

export function diversityScore(pillarId: string | null, recentPillarIds: readonly (string | null)[]): number {
  if (!pillarId || recentPillarIds.length === 0) return 70;
  const share = recentPillarIds.filter((id) => id === pillarId).length / recentPillarIds.length;
  return clampScore(100 - share * 100);
}

export function heuristicPersonaRelevance(text: string, keywords: readonly string[]): number {
  const lower = text.toLowerCase();
  const matches = keywords.filter((keyword) => lower.includes(keyword.toLowerCase())).length;
  return clampScore(35 + Math.min(55, matches * 15));
}
