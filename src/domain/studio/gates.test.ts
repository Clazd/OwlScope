import { describe, expect, it } from "vitest";
import { evaluateGates, type GateInput } from "./gates";
import type { Sentence } from "./schema";

function sentence(over: Partial<Sentence> = {}): Sentence {
  return {
    id: "s1",
    text: "Something is the case.",
    claimType: "fact",
    sourceIds: ["src_1"],
    support: "supported",
    ...over,
  };
}

function input(over: Partial<GateInput> = {}): GateInput {
  return {
    sentences: [sentence()],
    characterCount: 120,
    validation: null,
    critique: null,
    similarity: null,
    fingerprintScore: 90,
    fingerprintScored: true,
    fingerprintDeviations: [],
    boundaryBlocked: false,
    boundaryExplanation: "",
    staleAsCurrent: false,
    overriddenSentenceIds: [],
    ...over,
  };
}

const ids = (findings: Array<{ id: string }>) => findings.map((finding) => finding.id);

describe("quality gates", () => {
  it("passes a clean candidate", () => {
    const report = evaluateGates(input());
    expect(report.canFinalise).toBe(true);
    expect(report.blocking).toEqual([]);
  });

  it("blocks an unsupported factual claim", () => {
    const report = evaluateGates(
      input({ sentences: [sentence({ support: "unsupported", sourceIds: [] })] }),
    );
    expect(report.canFinalise).toBe(false);
    expect(ids(report.blocking)).toContain("unsupported:s1");
  });

  it("does not block an unsupported opinion", () => {
    const report = evaluateGates(
      input({ sentences: [sentence({ claimType: "opinion", support: "n/a", sourceIds: [] })] }),
    );
    expect(report.canFinalise).toBe(true);
  });

  it("lets the validator overrule the writer's own optimism", () => {
    const report = evaluateGates(
      input({
        sentences: [sentence({ support: "supported" })],
        validation: {
          sentences: [{ id: "s1", support: "unsupported", sourceIds: [], notes: "" }],
          canPublish: false,
          blockingReasons: [],
        },
      }),
    );
    expect(report.canFinalise).toBe(false);
  });

  it("clears an unsupported claim with an explicit override, and keeps a warning", () => {
    const report = evaluateGates(
      input({
        sentences: [sentence({ support: "unsupported", sourceIds: [] })],
        overriddenSentenceIds: ["s1"],
      }),
    );
    expect(report.canFinalise).toBe(true);
    expect(ids(report.warnings)).toContain("unsupported-override:s1");
  });

  it("does not let an override for one sentence clear another", () => {
    const report = evaluateGates(
      input({
        sentences: [
          sentence({ id: "s1", support: "unsupported", sourceIds: [] }),
          sentence({ id: "s2", support: "unsupported", sourceIds: [] }),
        ],
        overriddenSentenceIds: ["s1"],
      }),
    );
    expect(report.canFinalise).toBe(false);
    expect(ids(report.blocking)).toEqual(["unsupported:s2"]);
  });

  it("blocks a boundary violation and says why", () => {
    const report = evaluateGates(
      input({ boundaryBlocked: true, boundaryExplanation: "This is about an election." }),
    );
    expect(report.canFinalise).toBe(false);
    expect(report.blocking[0]?.message).toBe("This is about an election.");
  });

  it("blocks high similarity and only warns on medium", () => {
    const high = evaluateGates(
      input({ similarity: { risk: "high", matches: [], usedModel: false, comparedAgainst: 12 } }),
    );
    expect(high.canFinalise).toBe(false);

    const medium = evaluateGates(
      input({ similarity: { risk: "medium", matches: [], usedModel: false, comparedAgainst: 12 } }),
    );
    expect(medium.canFinalise).toBe(true);
    expect(ids(medium.warnings)).toContain("similarity-medium");
  });

  it("blocks when the critic says reject", () => {
    const report = evaluateGates(
      input({
        critique: {
          personaFit: "acceptable",
          genericness: "low",
          factualRisk: "low",
          issues: [],
          recommendation: "reject",
          fingerprintScore: 80,
          similarityRisk: "low",
        },
      }),
    );
    expect(ids(report.blocking)).toContain("critic-reject");
  });

  it("blocks on a weak persona fit — a voice that is not yours does not ship", () => {
    const report = evaluateGates(
      input({
        critique: {
          personaFit: "weak",
          genericness: "low",
          factualRisk: "low",
          issues: [],
          recommendation: "accept",
          fingerprintScore: 80,
          similarityRisk: "low",
        },
      }),
    );
    expect(ids(report.blocking)).toContain("persona-fit");
  });

  it("routes critic severities to the right list", () => {
    const report = evaluateGates(
      input({
        critique: {
          personaFit: "strong",
          genericness: "low",
          factualRisk: "low",
          issues: [
            { sentenceId: "s1", severity: "warn", type: "cliche", detail: "Stock phrase.", suggestion: "" },
            { sentenceId: null, severity: "note", type: "brevity", detail: "Could be shorter.", suggestion: "" },
          ],
          recommendation: "accept",
          fingerprintScore: 80,
          similarityRisk: "low",
        },
      }),
    );
    expect(report.canFinalise).toBe(true);
    expect(report.warnings.some((finding) => finding.message.includes("Stock phrase"))).toBe(true);
    // A note is neither blocking nor a warning — it is an observation.
    expect(report.warnings.some((finding) => finding.message.includes("Could be shorter"))).toBe(false);
  });

  it("blocks a current-events topic with no current evidence", () => {
    const report = evaluateGates(input({ staleAsCurrent: true }));
    expect(ids(report.blocking)).toContain("stale");
  });

  it("blocks over the character limit and warns when merely long", () => {
    expect(evaluateGates(input({ characterCount: 300 })).canFinalise).toBe(false);
    const long = evaluateGates(input({ characterCount: 260 }));
    expect(long.canFinalise).toBe(true);
    expect(ids(long.warnings)).toContain("long");
  });

  it("warns below a fingerprint score of 60 without blocking", () => {
    const report = evaluateGates(input({ fingerprintScore: 44 }));
    expect(report.canFinalise).toBe(true);
    expect(ids(report.warnings)).toContain("fingerprint-low");
  });

  it("blocks when three or more measured voice rules are badly broken", () => {
    const report = evaluateGates(
      input({
        fingerprintDeviations: [
          { rule: "avoided-opening", message: 'Opening matches "Here is the thing".', severity: "major" },
          { rule: "absent-vocabulary", message: 'Uses "unlock".', severity: "major" },
          { rule: "sentence-length", message: "Sentence 2 is 41 words.", severity: "major" },
        ],
      }),
    );
    expect(ids(report.blocking)).toContain("fingerprint-major");
  });

  it("warns about fact density without blocking", () => {
    const sentences = Array.from({ length: 5 }, (_, i) => sentence({ id: `s${i + 1}` }));
    const report = evaluateGates(input({ sentences }));
    expect(report.canFinalise).toBe(true);
    expect(ids(report.warnings)).toContain("fact-density");
  });

  it("warns about a rhetorical-question opening", () => {
    const report = evaluateGates(
      input({
        sentences: [
          sentence({ id: "s1", claimType: "rhetorical", text: "Ever wondered why?", support: "n/a", sourceIds: [] }),
        ],
      }),
    );
    expect(ids(report.warnings)).toContain("weak-opening");
  });

  it("reports every blocking reason at once rather than the first", () => {
    const report = evaluateGates(
      input({
        sentences: [sentence({ support: "unsupported", sourceIds: [] })],
        characterCount: 400,
        staleAsCurrent: true,
      }),
    );
    expect(report.blocking.length).toBeGreaterThanOrEqual(3);
  });
});
