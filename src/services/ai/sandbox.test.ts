import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

let fixturesDir: string;
let sandbox: typeof import("./sandbox");

const MODELS = { strong: "strong-model", fast: "fast-model" };

beforeEach(async () => {
  fixturesDir = await mkdtemp(join(tmpdir(), "studio-fixtures-"));
  process.env.FIXTURES_DIR = fixturesDir;
  vi.resetModules();
  sandbox = await import("./sandbox");
  // Any real fetch during a sandbox test is a bug: the whole point is that
  // sandbox mode makes zero network calls.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("sandbox mode must not touch the network");
    }),
  );
});

afterEach(async () => {
  await rm(fixturesDir, { recursive: true, force: true });
  delete process.env.FIXTURES_DIR;
  vi.unstubAllGlobals();
});

async function writeFixture(stage: string, kase: string, body: unknown) {
  await mkdir(join(fixturesDir, stage), { recursive: true });
  await writeFile(join(fixturesDir, stage, `${kase}.json`), JSON.stringify(body), "utf8");
}

describe("sandbox provider", () => {
  it("serves a completion from a fixture and makes no network call", async () => {
    await writeFixture("connection", "default", {
      text: "ready",
      model: "sandbox-fast",
      tokensIn: 14,
      tokensOut: 1,
      latencyMs: 38,
    });

    const result = await sandbox.createSandboxProvider(MODELS).complete({
      stage: "connection",
      tier: "fast",
      prompt: "say ready",
    });

    expect(result.text).toBe("ready");
    expect(result.model).toBe("sandbox-fast");
    expect(result.tokensIn).toBe(14);
    expect(result.latencyMs).toBe(38);
    expect(result.sandbox).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("still reports what the call would have cost", async () => {
    await writeFixture("connection", "default", { text: "ready", model: "claude-opus-4-6", tokensIn: 1_000_000, tokensOut: 0 });

    const result = await sandbox.createSandboxProvider(MODELS).complete({ stage: "connection", tier: "fast", prompt: "x" });
    expect(result.costEstimate).toBe(15);
  });

  it("falls back to the configured model and estimated tokens", async () => {
    await writeFixture("score", "default", { text: "ok" });

    const result = await sandbox.createSandboxProvider(MODELS).complete({ stage: "score", tier: "strong", prompt: "abcd" });
    expect(result.model).toBe("strong-model");
    expect(result.tokensIn).toBe(1);
    expect(result.tokensOut).toBe(1);
  });

  it("names the missing file when a fixture does not exist", async () => {
    await expect(
      sandbox.createSandboxProvider(MODELS).complete({ stage: "research", tier: "fast", prompt: "x" }),
    ).rejects.toMatchObject({
      category: "fixture-missing",
      message: expect.stringContaining("fixtures/research/default.json"),
    });
  });

  it("selects a named case", async () => {
    await writeFixture("connection", "default", { text: "ready" });
    await writeFixture("connection", "slow", { text: "ready", latencyMs: 4200 });

    const result = await sandbox.createSandboxProvider(MODELS).complete({
      stage: "connection",
      tier: "fast",
      prompt: "x",
      fixtureCase: "slow",
    });
    expect(result.latencyMs).toBe(4200);
  });

  it("throws when a fixture declares an error, so failure paths are testable", async () => {
    await writeFixture("connection", "unreachable", {
      text: "",
      error: { category: "network", message: "Could not reach the provider: simulated network failure." },
    });

    await expect(
      sandbox.createSandboxProvider(MODELS).complete({
        stage: "connection",
        tier: "fast",
        prompt: "x",
        fixtureCase: "unreachable",
      }),
    ).rejects.toThrow(/simulated network failure/);
  });

  it("parses a structured fixture against its schema", async () => {
    await writeFixture("score", "default", { text: '{"verdict":"skip"}' });

    const result = await sandbox.createSandboxProvider(MODELS).completeStructured({
      stage: "score",
      tier: "fast",
      prompt: "x",
      schema: z.object({ verdict: z.enum(["post", "skip"]) }),
      schemaName: "Verdict",
    });

    expect(result.data).toEqual({ verdict: "skip" });
    expect(result.repaired).toBe(false);
  });

  it("says which fixture is wrong when it does not match the schema", async () => {
    await writeFixture("score", "default", { text: '{"verdict":"maybe"}' });

    await expect(
      sandbox.createSandboxProvider(MODELS).completeStructured({
        stage: "score",
        tier: "fast",
        prompt: "x",
        schema: z.object({ verdict: z.enum(["post", "skip"]) }),
        schemaName: "Verdict",
      }),
    ).rejects.toMatchObject({
      category: "schema",
      message: expect.stringContaining("score/default"),
    });
  });

  it("refuses a stage name that tries to escape the fixtures directory", async () => {
    await expect(
      sandbox.createSandboxProvider(MODELS).complete({ stage: "../../etc", tier: "fast", prompt: "x" }),
    ).rejects.toMatchObject({ category: "fixture-missing" });
  });

  it("counts the fixtures on disk", async () => {
    await writeFixture("connection", "default", { text: "a" });
    await writeFixture("connection", "slow", { text: "b" });
    await writeFixture("research", "default", { text: "c" });

    expect(await sandbox.countFixtures()).toBe(3);
  });
});
