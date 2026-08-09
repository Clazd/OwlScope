import type { MemoryEntry, MemoryFilters } from "./schema";

/** Pure, deterministic, zero-I/O filtering over the derived Memory index. */
export function filterMemoryEntries(entries: readonly MemoryEntry[], filters: MemoryFilters): MemoryEntry[] {
  const query = filters.query?.trim().toLocaleLowerCase() ?? "";
  return entries.filter((entry) => {
    if (query && !`${entry.topic}\n${entry.thesis}\n${entry.text}`.toLocaleLowerCase().includes(query)) return false;
    if (filters.pillar && entry.pillarId !== filters.pillar) return false;
    if (filters.status && entry.status !== filters.status) return false;
    if (filters.angle && entry.angle !== filters.angle) return false;
    if (filters.feedback && !entry.feedbackLabels.some((label) => label === filters.feedback)) return false;
    if (filters.from && entry.date < filters.from) return false;
    if (filters.to && entry.date > filters.to) return false;
    return true;
  });
}
