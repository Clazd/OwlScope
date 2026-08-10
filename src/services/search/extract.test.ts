import { describe, expect, it } from "vitest";
import {
  classifyQuality,
  decodeEntities,
  domainOf,
  excerptOf,
  extractPublishedAt,
  extractReadableText,
  extractSocialImage,
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

describe("social image extraction", () => {
  const PAGE = "https://example.com/articles/one";

  it("reads og:image with its alt, size and credit", () => {
    const html = `
      <meta property="og:image" content="https://cdn.example.com/card.jpg">
      <meta property="og:image:alt" content="A chart of latency over time">
      <meta property="og:image:width" content="1200">
      <meta property="og:image:height" content="630">
      <meta property="og:site_name" content="Example Journal">`;
    expect(extractSocialImage(html, PAGE)).toEqual({
      url: "https://cdn.example.com/card.jpg",
      alt: "A chart of latency over time",
      width: 1200,
      height: 630,
      credit: "Example Journal",
    });
  });

  it("reads the attributes in the other order, which half the web emits", () => {
    const html = `<meta content="https://cdn.example.com/card.png" property="og:image">`;
    expect(extractSocialImage(html, PAGE)?.url).toBe("https://cdn.example.com/card.png");
  });

  it("falls back to the twitter card when there is no og:image", () => {
    const html = `<meta name="twitter:image" content="/media/card.webp">`;
    expect(extractSocialImage(html, PAGE)?.url).toBe("https://example.com/media/card.webp");
  });

  it("resolves a relative image against the page it came from", () => {
    const html = `<meta property="og:image" content="../shared/hero.jpg">`;
    expect(extractSocialImage(html, PAGE)?.url).toBe("https://example.com/shared/hero.jpg");
  });

  it("returns null when the page nominates nothing", () => {
    expect(extractSocialImage("<html><body><img src='/inline.png'></body></html>", PAGE)).toBeNull();
  });

  it("refuses a data URI, which is not something to save or credit", () => {
    const html = `<meta property="og:image" content="data:image/png;base64,iVBORw0KGgo=">`;
    expect(extractSocialImage(html, PAGE)).toBeNull();
  });

  it("drops an image the page itself declares too small to be a card", () => {
    const html = `
      <meta property="og:image" content="https://cdn.example.com/pixel.gif">
      <meta property="og:image:width" content="1">
      <meta property="og:image:height" content="1">`;
    expect(extractSocialImage(html, PAGE)).toBeNull();
  });

  it("keeps an image whose size the page never declares", () => {
    const html = `<meta property="og:image" content="https://cdn.example.com/card.jpg">`;
    expect(extractSocialImage(html, PAGE)).toMatchObject({ width: null, height: null });
  });

  it("decodes entities in the values it reads", () => {
    const html = `
      <meta property="og:image" content="https://cdn.example.com/a.jpg?w=1&amp;h=2">
      <meta property="og:image:alt" content="Tom &amp; Jerry">`;
    const image = extractSocialImage(html, PAGE);
    expect(image?.alt).toBe("Tom & Jerry");
    expect(image?.url).toContain("h=2");
  });
});
