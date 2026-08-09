import { describe, expect, it } from "vitest";
import { checkBoundariesMechanically } from "./boundary";
import type { Boundary } from "@/domain/persona/schema";

function boundary(kind: Boundary["kind"], value: string, enabled = true): Boundary {
  return { id: `b-${kind}-${value}`, kind, value, enabled };
}

describe("the mechanical boundary check", () => {
  it("fires on a stock keyword", () => {
    const hits = checkBoundariesMechanically(
      "What the election result means for procurement",
      [boundary("politics", "Politics")],
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]?.matched).toBe("election");
  });

  it("ignores a boundary the user has switched off", () => {
    const hits = checkBoundariesMechanically("The election result", [
      boundary("politics", "Politics", false),
    ]);
    expect(hits).toEqual([]);
  });

  it("matches whole words, so it does not fire on a substring", () => {
    // "voter" contains "vote", but the check is word-boundaried.
    const hits = checkBoundariesMechanically("Promotes better outcomes", [boundary("politics", "Politics")]);
    expect(hits).toEqual([]);
  });

  it("ignores punctuation and case", () => {
    const hits = checkBoundariesMechanically("THE ELECTION, revisited.", [boundary("politics", "Politics")]);
    expect(hits).toHaveLength(1);
  });

  it("matches a custom boundary on its own text", () => {
    const hits = checkBoundariesMechanically("A long look at cryptocurrency mining", [
      boundary("custom", "cryptocurrency"),
    ]);
    expect(hits[0]?.value).toBe("cryptocurrency");
  });

  it("refuses to match a custom boundary too short to mean anything", () => {
    // A two-character boundary would fire on half the language.
    const hits = checkBoundariesMechanically("AI and everything else", [boundary("custom", "AI")]);
    expect(hits).toEqual([]);
  });

  it("reports every boundary that fires, not just the first", () => {
    const hits = checkBoundariesMechanically(
      "An election-season sermon about celebrity dating rumour cycles",
      [
        boundary("politics", "Politics"),
        boundary("religion", "Religion"),
        boundary("celebrity-gossip", "Celebrity gossip"),
      ],
    );
    expect(hits.map((hit) => hit.value).sort()).toEqual(["Celebrity gossip", "Politics"]);
  });

  it("reports a boundary once even when several of its keywords appear", () => {
    const hits = checkBoundariesMechanically("The election, the ballot, and the campaign trail", [
      boundary("politics", "Politics"),
    ]);
    expect(hits).toHaveLength(1);
  });

  it("passes a topic that only sounds adjacent", () => {
    const hits = checkBoundariesMechanically("How governments procure software", [
      boundary("politics", "Politics"),
    ]);
    expect(hits).toEqual([]);
  });
});
