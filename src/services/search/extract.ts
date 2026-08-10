import type { SourceImage, SourceQuality } from "@/domain/studio/schema";

/**
 * Turning a fetched page into something a prompt can carry, and classifying
 * where it came from.
 *
 * Both are pure and both are deliberately unambitious. A real readability
 * implementation is a dependency and a maintenance burden; this one strips the
 * furniture and keeps the prose, which is all the researcher needs to quote
 * from. When it does a bad job the excerpt looks wrong in the source panel,
 * which is visible - not silent.
 */

/* ------------------------------------------------------------- extraction -- */

const DROP_ELEMENTS = /<(script|style|noscript|svg|iframe|nav|header|footer|form|aside)\b[\s\S]*?<\/\1>/gi;
const SELF_CLOSING = /<(br|hr|img|input|meta|link)\b[^>]*\/?>/gi;
const BLOCK_END = /<\/(p|div|section|article|li|h[1-6]|blockquote|tr)>/gi;
const TAG = /<[^>]+>/g;

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  "&mdash;": "-",
  "&ndash;": "–",
  "&hellip;": "…",
  "&rsquo;": "’",
  "&lsquo;": "‘",
  "&rdquo;": "”",
  "&ldquo;": "“",
};

export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&[a-z]+;|&#\d+;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? entity);
}

export function extractTitle(html: string): string {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  if (og?.[1]) return decodeEntities(og[1]).trim();
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return title?.[1] ? decodeEntities(title[1]).replace(/\s+/g, " ").trim() : "";
}

/**
 * The publication date, from the metadata a publisher actually sets. Null when
 * nothing says - never a guess, because "when was this published" is exactly
 * the kind of fact the freshness check depends on.
 */
export function extractPublishedAt(html: string): string | null {
  const patterns = [
    /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["'](?:pubdate|publish-date|date)["'][^>]+content=["']([^"']+)["']/i,
    /<time[^>]+datetime=["']([^"']+)["']/i,
    /"datePublished"\s*:\s*"([^"]+)"/i,
  ];
  for (const pattern of patterns) {
    const found = html.match(pattern)?.[1];
    if (!found) continue;
    const date = new Date(found);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return null;
}

/* ----------------------------------------------------------------- images -- */

/**
 * A `<meta>` value, in either attribute order. Publishers emit both
 * `property=… content=…` and `content=… property=…`, and a reader that only
 * knows one of them silently finds nothing on half the web.
 */
function metaContent(html: string, names: string[]): string {
  for (const name of names) {
    const key = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const attribute = `(?:property|name|itemprop)=["']${key}["']`;
    const forward = html.match(new RegExp(`<meta[^>]+${attribute}[^>]+content=["']([^"']*)["']`, "i"));
    if (forward?.[1]?.trim()) return decodeEntities(forward[1]).trim();
    const reverse = html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+${attribute}`, "i"));
    if (reverse?.[1]?.trim()) return decodeEntities(reverse[1]).trim();
  }
  return "";
}

/** Tracking pixels and spacers declare themselves by size. Nothing else does. */
const MIN_SHAREABLE_EDGE = 200;

function positiveInt(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * The image a page nominates for sharing, resolved against the page URL.
 *
 * Only the social-card metadata is read - `og:image` and its Twitter
 * equivalent. That is a deliberate limit: those are the images a publisher
 * chose to be reproduced when their page is shared, which is a far better
 * signal than the largest `<img>` in the body, and it means this never goes
 * hunting through a page for pictures nobody offered.
 */
export function extractSocialImage(html: string, pageUrl: string): SourceImage | null {
  const raw = metaContent(html, [
    "og:image:secure_url",
    "og:image:url",
    "og:image",
    "twitter:image",
    "twitter:image:src",
  ]);
  if (!raw) return null;

  let url: URL;
  try {
    // Relative `og:image` values are common and legal. Resolve, then insist on
    // a real remote http(s) URL - a data: URI is not something to save or credit.
    url = new URL(raw, pageUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const width = positiveInt(metaContent(html, ["og:image:width", "twitter:image:width"]));
  const height = positiveInt(metaContent(html, ["og:image:height", "twitter:image:height"]));
  // Only reject on a size the page itself declares. An undeclared size is
  // unknown, not small, and dropping those would discard most of the web.
  if ((width !== null && width < MIN_SHAREABLE_EDGE) || (height !== null && height < MIN_SHAREABLE_EDGE)) {
    return null;
  }

  return {
    url: url.toString(),
    alt: metaContent(html, ["og:image:alt", "twitter:image:alt"]),
    width,
    height,
    credit: metaContent(html, ["article:author", "author", "og:site_name", "twitter:site"]),
  };
}

export function extractReadableText(html: string): string {
  return decodeEntities(
    html
      .replace(DROP_ELEMENTS, " ")
      .replace(SELF_CLOSING, " ")
      .replace(BLOCK_END, "\n")
      .replace(TAG, " "),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n")
    .trim();
}

/** What goes in a source record. Long enough to quote, short enough to budget. */
export const EXCERPT_LIMIT = 1200;

export function excerptOf(text: string, limit = EXCERPT_LIMIT): string {
  const trimmed = text.trim();
  if (trimmed.length <= limit) return trimmed;
  // Cut at a sentence boundary when there is one nearby, so the excerpt does
  // not end mid-clause and read as if the source trailed off.
  const window = trimmed.slice(0, limit);
  const lastStop = Math.max(window.lastIndexOf(". "), window.lastIndexOf("\n"));
  return `${(lastStop > limit * 0.6 ? window.slice(0, lastStop + 1) : window).trim()}…`;
}

/* --------------------------------------------------------------- quality -- */

const FORUM_DOMAINS = [
  "reddit.com",
  "news.ycombinator.com",
  "ycombinator.com",
  "stackoverflow.com",
  "stackexchange.com",
  "quora.com",
  "x.com",
  "twitter.com",
  "discord.com",
  "lobste.rs",
];

const AGGREGATOR_DOMAINS = [
  "techmeme.com",
  "google.com",
  "news.google.com",
  "bing.com",
  "flipboard.com",
  "medium.com",
  "substack.com",
  "dev.to",
];

const SECONDARY_DOMAINS = [
  "theverge.com",
  "arstechnica.com",
  "wired.com",
  "techcrunch.com",
  "bbc.co.uk",
  "reuters.com",
  "ft.com",
  "nytimes.com",
  "theguardian.com",
];

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function matches(domain: string, list: string[]): boolean {
  return list.some((entry) => domain === entry || domain.endsWith(`.${entry}`));
}

/**
 * Where a claim came from, classified so the UI can show it and the writer can
 * weight it. Primary means the source is the thing itself - a paper, a docs
 * page, a company's own announcement - not somebody's write-up of it.
 */
export function classifyQuality(url: string): SourceQuality {
  const domain = domainOf(url);
  if (!domain) return "unknown";
  if (matches(domain, FORUM_DOMAINS)) return "forum";
  if (matches(domain, AGGREGATOR_DOMAINS)) return "aggregator";
  if (matches(domain, SECONDARY_DOMAINS)) return "secondary";

  // Government and academic domains, in both shapes they come in: the US-style
  // suffix (`nist.gov`, `mit.edu`) and the country-code form (`gov.uk`,
  // `ac.uk`, `edu.au`), which a plain `.gov` suffix check silently misses.
  if (/(^|\.)(gov|edu|ac|mil|int)(\.[a-z]{2,3})?$/.test(domain)) return "primary";
  if (matches(domain, ["arxiv.org", "openalex.org", "doi.org", "acm.org", "ieee.org", "nature.com", "science.org", "github.com"])) {
    return "primary";
  }

  // A vendor's own domain talking about its own product is a primary source.
  const path = safePath(url);
  if (/^\/(docs|documentation|blog|changelog|release|news|research|papers?)\b/.test(path)) return "primary";

  return "unknown";
}

function safePath(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return "";
  }
}
