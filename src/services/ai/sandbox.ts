import "server-only";
import { createLogger } from "@/lib/logging/log";
import {
  FixtureNotFoundError,
  countFixtureFiles,
  fixtureLabel,
  readFixture,
} from "@/services/storage/fixtures";
import { estimateCost } from "./pricing";
import { validate } from "./anthropic";
import {
  ProviderError,
  type AIProvider,
  type CompletionRequest,
  type CompletionResult,
  type ModelTier,
  type StructuredRequest,
  type StructuredResult,
} from "./types";

const log = createLogger("ai/sandbox");

/** The on-disk shape of `/fixtures/<stage>/<case>.json`. */
interface Fixture {
  text: string;
  tokensIn?: number;
  tokensOut?: number;
  latencyMs?: number;
  model?: string;
  /** Set to make the fixture exercise an error path instead of a happy path. */
  error?: { category: string; message: string };
}

async function loadFixture(stage: string, kase: string): Promise<Fixture> {
  let raw: string;
  try {
    raw = await readFixture(stage, kase);
  } catch (err) {
    if (err instanceof FixtureNotFoundError) {
      throw new ProviderError(
        "fixture-missing",
        `Sandbox mode is on and there is no fixture for ${stage}/${kase}. Add ${fixtureLabel(stage, kase)}.`,
      );
    }
    throw err;
  }
  try {
    return JSON.parse(raw) as Fixture;
  } catch (err) {
    throw new ProviderError("parse", `Fixture ${fixtureLabel(stage, kase)} is not valid JSON.`, { cause: err });
  }
}

/** Counts the fixtures on disk, for the Settings sandbox section. */
export function countFixtures(): Promise<number> {
  return countFixtureFiles();
}

/**
 * Serves every call from `/fixtures` instead of the network. The full pipeline
 * runs, the full UI renders, zero API calls, zero cost. This is how the app is
 * developed and how the tests run.
 */
export function createSandboxProvider(models: Record<ModelTier, string>): AIProvider {
  async function complete(req: CompletionRequest): Promise<CompletionResult> {
    const started = Date.now();
    const kase = req.fixtureCase ?? "default";
    const fixture = await loadFixture(req.stage, kase);

    if (fixture.error) {
      throw new ProviderError("unknown", fixture.error.message);
    }

    // A small real delay keeps loading states honest without slowing tests down.
    const declared = fixture.latencyMs ?? 40;
    await new Promise((r) => setTimeout(r, Math.min(declared, 120)));

    const model = fixture.model ?? models[req.tier] ?? "sandbox";
    const tokensIn = fixture.tokensIn ?? Math.ceil(req.prompt.length / 4);
    const tokensOut = fixture.tokensOut ?? Math.ceil(fixture.text.length / 4);

    log.debug(`served ${req.stage}/${kase} from fixtures`);

    return {
      text: fixture.text,
      prompt: req.prompt,
      system: req.system,
      tokensIn,
      tokensOut,
      latencyMs: declared || Date.now() - started,
      model,
      // Sandbox runs are free. Showing what they would have cost is the point.
      costEstimate: estimateCost(model, tokensIn, tokensOut),
      sandbox: true,
    };
  }

  async function completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const kase = req.fixtureCase ?? "default";
    const result = await complete(req);
    const parsed = validate(req, result.text);
    if (!parsed.ok) {
      // A fixture that does not match its schema is an authoring mistake, not a
      // model failure, so there is no repair pass — just say which file is wrong.
      throw new ProviderError("schema", `Fixture ${req.stage}/${kase} does not match ${req.schemaName}.`, {
        detail: parsed.error,
      });
    }
    return { ...result, data: parsed.data, repaired: false };
  }

  return {
    name: "sandbox",
    complete,
    completeStructured,
    searchCapability: () => ({ supported: false }),
  };
}
