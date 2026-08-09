import { describe, expect, it } from "vitest";
import {
  TransitionError,
  allowedTransitions,
  applyTransition,
  assertTransition,
  canTransition,
} from "./state-machine";
import type { ContentStatus } from "./schema";

const ALL: ContentStatus[] = ["draft", "reviewing", "accepted", "published", "rejected", "archived"];

describe("the content state machine", () => {
  it("walks the happy path", () => {
    expect(canTransition("draft", "reviewing")).toBe(true);
    expect(canTransition("reviewing", "accepted")).toBe(true);
    expect(canTransition("accepted", "published")).toBe(true);
  });

  it("never lets anything skip straight to published", () => {
    // "Generated is never treated as published" is this line.
    for (const from of ALL) {
      if (from === "accepted") continue;
      expect(canTransition(from, "published")).toBe(false);
    }
  });

  it("treats published as terminal except for archiving", () => {
    expect(allowedTransitions("published")).toEqual(["archived"]);
  });

  it("treats archived as final", () => {
    expect(allowedTransitions("archived")).toEqual([]);
  });

  it("allows stepping back from reviewing and accepted", () => {
    expect(canTransition("reviewing", "draft")).toBe(true);
    expect(canTransition("accepted", "reviewing")).toBe(true);
  });

  it("allows a rejected post to be reopened", () => {
    expect(canTransition("rejected", "draft")).toBe(true);
  });

  it("treats a no-op transition as allowed", () => {
    expect(() => assertTransition("published", "published")).not.toThrow();
  });

  it("names what is allowed when it refuses", () => {
    try {
      assertTransition("draft", "published");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(TransitionError);
      expect((err as Error).message).toContain("reviewing");
    }
  });
});

describe("applyTransition", () => {
  const base = { status: "accepted" as ContentStatus, publishedAt: null, publicUrl: null };

  it("stamps publishedAt only when publishing", () => {
    const result = applyTransition(base, "published", { now: "2026-08-09T10:00:00.000Z" });
    expect(result.publishedAt).toBe("2026-08-09T10:00:00.000Z");
  });

  it("records the public URL when one is given", () => {
    const result = applyTransition(base, "published", { publicUrl: " https://x.com/a/1 " });
    expect(result.publicUrl).toBe("https://x.com/a/1");
  });

  it("treats a blank URL as no URL rather than an empty string", () => {
    const result = applyTransition(base, "published", { publicUrl: "   " });
    expect(result.publicUrl).toBeNull();
  });

  it("leaves publishedAt alone on every other transition", () => {
    const result = applyTransition(base, "rejected");
    expect(result.publishedAt).toBeNull();
    expect(result.status).toBe("rejected");
  });

  it("never clears publishedAt once set", () => {
    const published = { status: "published" as ContentStatus, publishedAt: "2026-01-01T00:00:00.000Z", publicUrl: null };
    const archived = applyTransition(published, "archived");
    expect(archived.publishedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("refuses an illegal transition rather than quietly applying it", () => {
    expect(() => applyTransition({ status: "draft", publishedAt: null, publicUrl: null }, "published")).toThrow(
      TransitionError,
    );
  });
});
