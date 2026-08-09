import type { SearchResult } from "@/services/search/provider";

const TRACKING = new Set(["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "ref", "source"]);

export function canonicalUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = "";
    url.hostname = url.hostname.replace(/^www\./, "").toLowerCase();
    for (const key of [...url.searchParams.keys()]) if (TRACKING.has(key.toLowerCase())) url.searchParams.delete(key);
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString().replace(/\/$/, "");
  } catch {
    return raw.trim().toLowerCase();
  }
}

export function normalisedTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\b(breaking|exclusive|analysis|opinion)\b\s*:?/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface DedupedCandidate {
  key: string;
  title: string;
  summary: string;
  sources: SearchResult[];
}

/** URL and title aliases are unioned, so a bridge item merges groups transitively. */
export function deduplicateResults(results: readonly SearchResult[]): DedupedCandidate[] {
  const parent = results.map((_, index) => index);
  const firstByUrl = new Map<string, number>();
  const firstByTitle = new Map<string, number>();
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root] as number;
    while (parent[index] !== index) {
      const next = parent[index] as number;
      parent[index] = root;
      index = next;
    }
    return root;
  };
  const union = (left: number, right: number) => {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
  };

  results.forEach((item, index) => {
    const url = canonicalUrl(item.url);
    const title = normalisedTitle(item.title);
    const urlMatch = firstByUrl.get(url);
    const titleMatch = title ? firstByTitle.get(title) : undefined;
    if (urlMatch !== undefined) union(index, urlMatch);
    if (titleMatch !== undefined) union(index, titleMatch);
    firstByUrl.set(url, index);
    if (title) firstByTitle.set(title, index);
  });

  const groups = new Map<number, DedupedCandidate>();
  results.forEach((item, index) => {
    const root = find(index);
    const url = canonicalUrl(item.url);
    const group = groups.get(root) ?? {
      key: canonicalUrl(results[root]?.url ?? item.url) || normalisedTitle(item.title),
      title: item.title.trim(), summary: item.snippet.trim(), sources: [],
    };
    if (!group.sources.some((source) => canonicalUrl(source.url) === url && source.providerId === item.providerId)) group.sources.push(item);
    if (item.title.trim().length > group.title.length) group.title = item.title.trim();
    if (item.snippet.trim().length > group.summary.length) group.summary = item.snippet.trim();
    groups.set(root, group);
  });
  return [...groups.values()];
}
