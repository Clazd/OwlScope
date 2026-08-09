import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dataDir = mkdtempSync(join(tmpdir(), "studio-evolution-"));
process.env.DATA_DIR = dataDir;

let evolve: typeof import("./evolve");
let feedbackStore: typeof import("@/domain/feedback/store").feedbackStore;
let readPersona: typeof import("@/domain/persona/store").readPersona;
let getVersion: typeof import("@/domain/persona/versions").getVersion;

beforeAll(async () => {
  const [module, feedback, personaStore, versions, demo] = await Promise.all([import("./evolve"), import("@/domain/feedback/store"), import("@/domain/persona/store"), import("@/domain/persona/versions"), import("@/domain/persona/demo")]);
  evolve = module; feedbackStore = feedback.feedbackStore; readPersona = personaStore.readPersona; getVersion = versions.getVersion;
  await personaStore.writeSnapshot(demo.buildDemoSnapshot("2026-08-09T00:00:00.000Z"));
});
afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

describe("persona evolution guardrails", () => {
  it("refuses to suggest below fifteen feedback events", async () => {
    const result = await evolve.analyseEvolution();
    expect(result.suggestion).toBeNull();
    expect(result.reason).toContain("At least 15");
  });

  it("accepts only explicitly and records a new persona version with origin", async () => {
    for (let index = 0; index < 15; index += 1) await feedbackStore.put({ id: `c${index}`, kind: "today-rejection", contentId: `c${index}`, topicId: `t${index}`, reasons: ["too generic"], note: "", createdAt: `2026-08-09T${String(index).padStart(2, "0")}:00:00.000Z`, undoneAt: null });
    const analysed = await evolve.analyseEvolution();
    expect(analysed.suggestion?.status).toBe("pending");
    const before = (await readPersona())!.activeVersion;
    const accepted = await evolve.resolveSuggestion(analysed.suggestion!.id, "accept", 25);
    expect((await readPersona())!.activeVersion).toBe(before + 1);
    expect(accepted.personaVersion).toBe(before + 1);
    expect((await getVersion(before + 1))?.changeReason).toContain("Accepted evolution suggestion");
  });

  it("never raises the same suggestion after three declines", async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const suggestion = (await evolve.analyseEvolution()).suggestion!;
      await evolve.resolveSuggestion(suggestion.id, "reject");
    }
    const result = await evolve.analyseEvolution();
    expect(result.suggestion).toBeNull();
    expect(result.reason).toContain("declined three times");
  });
});
