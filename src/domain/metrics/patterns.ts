import type { MemoryContentEntry } from "@/domain/memory/schema";
import type { Metric } from "./schema";

export interface PatternFinding {
  id: string;
  sampleSize: number;
  observation: string;
}

export interface PatternReport {
  metricCount: number;
  findings: PatternFinding[];
}

export function buildPatternReport(entries: readonly MemoryContentEntry[], metrics: readonly Metric[], confidenceFloor: number): PatternReport | null {
  const usable = metrics.filter((metric) => metric.recordedAt && metric.impressions !== null);
  if (usable.length < 10) return null;
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const rows = usable.flatMap((metric) => {
    const entry = entryById.get(metric.contentId);
    return entry && metric.impressions !== null ? [{ entry, impressions: metric.impressions }] : [];
  });
  if (rows.length < 10) return null;

  const findings = [
    compareGroups("pillar", rows, (row) => row.entry.pillar || "Unassigned", confidenceFloor),
    compareGroups("angle", rows, (row) => row.entry.angle || "Unassigned", confidenceFloor),
    compareGroups("length", rows, (row) => row.entry.characterCount < 180 ? "short" : row.entry.characterCount <= 240 ? "medium" : "long", confidenceFloor),
    compareGroups("freshness", rows, (row) => row.entry.freshness, confidenceFloor),
    compareGroups("posting hour", rows, (row) => `${new Date(row.entry.publishedAt ?? row.entry.createdAt).getHours().toString().padStart(2, "0")}:00`, confidenceFloor),
  ].filter((finding): finding is PatternFinding => Boolean(finding));
  return { metricCount: rows.length, findings };
}

function compareGroups(
  dimension: string,
  rows: ReadonlyArray<{ entry: MemoryContentEntry; impressions: number }>,
  groupFor: (row: { entry: MemoryContentEntry; impressions: number }) => string,
  confidenceFloor: number,
): PatternFinding | null {
  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const key = groupFor(row);
    const group = groups.get(key) ?? [];
    group.push(row.impressions);
    groups.set(key, group);
  }
  const ranked = [...groups.entries()]
    .filter(([, values]) => values.length >= 2)
    .map(([name, values]) => ({ name, count: values.length, average: average(values) }))
    .sort((a, b) => b.average - a.average);
  const high = ranked[0];
  const low = ranked.at(-1);
  if (!high || !low || high.name === low.name || high.average === 0) return null;
  const difference = (high.average - low.average) / high.average;
  if (difference < confidenceFloor) return null;
  return {
    id: dimension,
    sampleSize: rows.length,
    observation: `Your ${high.name} ${dimension} posts averaged ${Math.round(high.average).toLocaleString()} impressions, compared with ${Math.round(low.average).toLocaleString()} for ${low.name} (${high.count} vs ${low.count} posts).`,
  };
}

const average = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
