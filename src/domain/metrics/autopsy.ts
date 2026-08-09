import type { ContentItem } from "@/domain/studio/schema";
import type { Metric } from "./schema";

export function dueAutopsy(content: readonly ContentItem[], metrics: readonly Metric[], now = new Date()): ContentItem | null {
  const seen = new Set(metrics.map((metric) => metric.contentId));
  const cutoff = now.getTime() - 7 * 86_400_000;
  return content
    .filter((item) => item.status === "published" && item.publishedAt && new Date(item.publishedAt).getTime() <= cutoff && !seen.has(item.id))
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))[0] ?? null;
}
