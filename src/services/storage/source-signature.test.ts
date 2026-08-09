import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let dataDir: string;
let sourceSignature: typeof import("./source-signature").sourceSignature;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "studio-signature-"));
  process.env.DATA_DIR = dataDir;
  vi.resetModules();
  sourceSignature = (await import("./source-signature")).sourceSignature;
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
});

describe("derived index source signature", () => {
  it("checks one thousand source files without reading their bodies", async () => {
    const contentDir = join(dataDir, "content");
    await mkdir(contentDir, { recursive: true });
    await Promise.all(Array.from({ length: 1_000 }, (_, index) =>
      writeFile(join(contentDir, `${index}.json`), `{"id":"${index}","body":"${"x".repeat(1_000)}"}`, "utf8"),
    ));

    const started = performance.now();
    const signature = await sourceSignature([contentDir]);
    const elapsed = performance.now() - started;

    expect(signature).toMatch(/^[a-f0-9]{64}$/);
    expect(elapsed).toBeLessThan(250);
  });
});
