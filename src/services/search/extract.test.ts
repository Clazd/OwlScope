import { describe, expect, it } from "vitest";
import {
  classifyQuality,
  decodeEntities,
  domainOf,
  excerptOf,
  extractPublishedAt,
  extractReadableText,
  extractTitle,
} from "./extract";

describe("readable text extraction", () => {
  it("drops scripts, styles and page furniture", () => {
    const html = `
      <html><head><style>body{color:red}</style></head>
      <body><nav>Home About</nav><script>alert(1)</script>
      <p>The actual sentence.</p><footer>Copyright</footer></body></html>`;
    const text = extractReadableText(html);
    expect(text).toContain("The actual sentence.");
    expect(text).not.toContain("alert");
    expect(text).not.toContain("Copyright");
    expect(text).not.toContain("Home About");
  });

  it("keeps block boundaries as line breaks", () => {
    expect(extractReadableText("<p>One</p><p>Two</p>")).toBe("One\nTwo");
  });

  it("decodes the entities a real page actually contains", () => {
    expect(decodeEntities("Tom &amp; Jerry &mdash; &#39;quoted&#39;")).toBe("Tom & Jerry - 'quoted'");
  });

  it("decodes numeric and hex references", () => {
    expect(decodeEntities("&#65;&#x42;")).toBe("AB");
  });

  it("leaves an entity it does not know alone rather than mangling it", () => {
    expect(decodeEntities("&zwnj;")).toBe("&zwnj;");
  });
});

describe("titles and dates", () => {
  it("prefers the og:title, which publishers curate", () => {
    const html = `<meta property="og:title" content="The real headline"><title>Site - The real headline</title>`;
    expect(extractTitle(html)).toBe("The real headline");
  });

  it("falls back to the title tag", () => {
    expect(extractTitle("<title>  Just  this  </title>")).toBe("Just this");
  });

  it("reads a published date from article metadata", () => {
    const html = `<meta property="article:published_time" content="2026-08-08T06:00:00Z">`;
    expect(extractPublishedAt(html)).toBe("2026-08-08T06:00:00.000Z");
  });

  it("reads a JSON-LD datePublished", () => {
    expect(extractPublishedAt('{"datePublished": "2026-01-02"}')).toBe("2026-01-02T00:00:00.000Z");
  });

  it("returns null rather than guessing when nothing says", () => {
    // Freshness decisions rest on this, so an invented date is worse than none.
    expect(extractPublishedAt("<p>Published recently</p>")).toBeNull();
  });

  it("returns null for a date it cannot parse", () => {
    expect(extractPublishedAt('<time datetime="last Tuesday">')).toBeNull();
  });
});

describe("excerpts", () => {
  it("leaves short text alone", () => {
    expect(excerptOf("Short.")).toBe("Short.");
  });

  it("cuts at a sentence boundary when one is near the limit", () => {
    const text = `${"a".repeat(60)}. ${"b".repeat(60)}. ${"c".repeat(200)}`;
    const excerpt = excerptOf(text, 130);
    expect(excerpt.endsWith("…")).toBe(true);
    expect(excerpt).not.toContain("c");
  });

  it("still truncates when there is no sentence boundary to cut at", () => {
    const excerpt = excerptOf("x".repeat(500), 100);
    expect(excerpt.length).toBeLessThanOrEqual(101);
  });
});

describe("source quality", () => {
  it("reads the domain without the www prefix", () => {
    expect(domainOf("https://www.Example.COM/a/b")).toBe("example.com");
  });

  it("returns an empty domain for something that is not a URL", () => {
    expect(domainOf("not a url")).toBe("");
  });

  it("classifies forums as forums", () => {
    expect(classifyQuality("https://news.ycombinator.com/item?id=1")).toBe("forum");
    expect(classifyQuality("https://www.reddit.com/r/x/comments/y")).toBe("forum");
  });

  it("classifies aggregators and publishing platforms as aggregators", () => {
    expect(classifyQuality("https://techmeme.com/260808/p1")).toBe("aggregator");
    expect(classifyQuality("https://someone.substack.com/p/thing")).toBe("aggregator");
    expect(classifyQuality("https://dev.to/someone/thing")).toBe("aggregator");
  });

  it("classifies known outlets as secondary", () => {
    expect(classifyQuality("https://www.theverge.com/2026/8/8/thing")).toBe("secondary");
  });

  it("classifies papers, official sites and docs as primary", () => {
    expect(classifyQuality("https://arxiv.org/abs/2608.01234")).toBe("primary");
    expect(classifyQuality("https://www.gov.uk/consultation")).toBe("primary");
    expect(classifyQuality("https://acme.io/docs/agents")).toBe("primary");
    expect(classifyQuality("https://acme.io/changelog")).toBe("primary");
    expect(classifyQuality("https://doi.org/10.1000/example")).toBe("primary");
  });

  it("says unknown rather than guessing", () => {
    expect(classifyQuality("https://some-blog-nobody-knows.net/post/1")).toBe("unknown");
    expect(classifyQuality("not a url")).toBe("unknown");
  });

  it("matches a subdomain of a known domain", () => {
    expect(classifyQuality("https://old.reddit.com/r/x")).toBe("forum");
  });
});
