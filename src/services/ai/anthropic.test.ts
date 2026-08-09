import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createAnthropicProvider } from "./anthropic";
import { estimateCost, rateFor } from "./pricing";
import { ProviderError, type StructuredRequest } from "./types";

const MODELS = { strong: "claude-opus-4-6", fast: "claude-haiku-4-5-20251001" };

function provider() {
  return createAnthropicProvider({ apiKey: "test-key", baseUrl: "https://api.example", models: MODELS });
}

function reply(text: string, tokensIn = 10, tokensOut = 5) {
  return new Response(
    JSON.stringify({
      model: MODELS.fast,
      content: [{ type: "text", text }],
      usage: { input_tokens: tokensIn, output_tokens: tokensOut },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("anthropic adapter", () => {
  it("refuses to construct without an API key", () => {
    expect(() => createAnthropicProvider({ apiKey: "", baseUrl: "https://api.example", models: MODELS })).toThrow(
      /No AI_API_KEY/,
    );
  });

  it("sends the configured model for the tier and returns usage metadata", async () => {
    fetchMock.mockImplementation(async () => reply("hello", 120, 40));

    const result = await provider().complete({ stage: "connection", tier: "fast", prompt: "hi" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.example/v1/messages");
    expect(JSON.parse(init.body as string).model).toBe(MODELS.fast);
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("test-key");

    expect(result.text).toBe("hello");
    expect(result.tokensIn).toBe(120);
    expect(result.tokensOut).toBe(40);
    expect(result.model).toBe(MODELS.fast);
    expect(result.sandbox).toBe(false);
    expect(result.costEstimate).toBeCloseTo(estimateCost(MODELS.fast, 120, 40), 10);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("uses the strong model when asked for it", async () => {
    fetchMock.mockImplementation(async () => reply("ok"));
    await provider().complete({ stage: "write", tier: "strong", prompt: "hi" });
    expect(JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string).model).toBe(MODELS.strong);
  });

  it("names a timeout as a timeout, not an unknown failure", async () => {
    const timeout = Object.assign(new Error("aborted"), { name: "TimeoutError" });
    fetchMock.mockRejectedValue(timeout);

    await expect(
      provider().complete({ stage: "research", tier: "fast", prompt: "hi", timeoutMs: 30_000 }),
    ).rejects.toMatchObject({ category: "timeout", message: expect.stringContaining("30s") });
  });

  it("categorises auth failures and does not retry them", async () => {
    fetchMock.mockImplementation(async () => new Response("bad key", { status: 401 }));

    await expect(provider().complete({ stage: "connection", tier: "fast", prompt: "hi" })).rejects.toMatchObject({
      category: "auth",
      status: 401,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry a 400, which would only fail the same way", async () => {
    fetchMock.mockImplementation(async () => new Response("bad request", { status: 400 }));

    await expect(provider().complete({ stage: "connection", tier: "fast", prompt: "hi" })).rejects.toMatchObject({
      category: "http",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a 500 and succeeds on a later attempt", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(new Response("boom", { status: 500 }))
      .mockResolvedValueOnce(reply("recovered"));

    const pending = provider().complete({ stage: "connection", tier: "fast", prompt: "hi" });
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result.text).toBe("recovered");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("gives up after a bounded number of attempts", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async () => new Response("still down", { status: 503 }));

    const pending = provider().complete({ stage: "connection", tier: "fast", prompt: "hi" });
    const assertion = expect(pending).rejects.toMatchObject({ category: "http", status: 503 });
    await vi.runAllTimersAsync();
    await assertion;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it("reports an unreachable host as a network failure", async () => {
    vi.useFakeTimers();
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    const pending = provider().complete({ stage: "connection", tier: "fast", prompt: "hi" });
    const assertion = expect(pending).rejects.toMatchObject({ category: "network" });
    await vi.runAllTimersAsync();
    await assertion;
    vi.useRealTimers();
  });

  it("has no search capability in this slice", () => {
    expect(provider().searchCapability()).toEqual({ supported: false });
  });
});

describe("completeStructured", () => {
  const schema = z.object({ verdict: z.enum(["post", "skip"]), why: z.string() });
  const request: StructuredRequest<z.infer<typeof schema>> = {
    stage: "score",
    tier: "fast",
    prompt: "Decide.",
    schema,
    schemaName: "Verdict",
  };

  it("parses a clean JSON response", async () => {
    fetchMock.mockImplementation(async () => reply('{"verdict":"skip","why":"nothing new"}'));

    const result = await provider().completeStructured(request);

    expect(result.data).toEqual({ verdict: "skip", why: "nothing new" });
    expect(result.repaired).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("survives a code fence and a sentence of preamble without a second call", async () => {
    fetchMock.mockImplementation(async () => reply('Sure:\n```json\n{"verdict":"post","why":"new filing"}\n```'));

    const result = await provider().completeStructured(request);

    expect(result.data.verdict).toBe("post");
    expect(result.repaired).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("makes exactly one repair attempt, feeding the error back", async () => {
    fetchMock
      .mockResolvedValueOnce(reply('{"verdict":"maybe","why":"unsure"}', 100, 20))
      .mockResolvedValueOnce(reply('{"verdict":"skip","why":"unsure"}', 150, 20));

    const result = await provider().completeStructured(request);

    expect(result.repaired).toBe(true);
    expect(result.data.verdict).toBe("skip");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // The repair prompt carries the previous reply and the validation problem.
    const repairBody = JSON.parse((fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string);
    expect(repairBody.messages[0].content).toContain("did not validate");
    expect(repairBody.messages[0].content).toContain("verdict");

    // Both calls are billed, so the meter tells the truth about a repair.
    expect(result.tokensIn).toBe(250);
    expect(result.tokensOut).toBe(40);
  });

  it("fails loudly after the repair attempt, rather than trying again", async () => {
    fetchMock.mockImplementation(async () => reply("not json at all"));

    await expect(provider().completeStructured(request)).rejects.toMatchObject({
      category: "schema",
      message: expect.stringContaining("Verdict"),
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("asks for bare JSON in the prompt it actually sends", async () => {
    fetchMock.mockImplementation(async () => reply('{"verdict":"post","why":"x"}'));
    await provider().completeStructured(request);

    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.messages[0].content).toContain("Verdict");
    expect(body.messages[0].content).toContain("No prose");
  });
});

describe("pricing", () => {
  it("matches a model by its longest prefix", () => {
    expect(rateFor("claude-opus-4-6")).toEqual({ in: 15, out: 75 });
    expect(rateFor("claude-haiku-4-5-20251001")).toEqual({ in: 1, out: 5 });
    expect(rateFor("claude-3-haiku-20240307")).toEqual({ in: 0.25, out: 1.25 });
  });

  it("falls back for a model it has never seen", () => {
    expect(rateFor("some-future-model")).toEqual({ in: 3, out: 15 });
  });

  it("estimates a cost from tokens", () => {
    expect(estimateCost("claude-opus-4-6", 1_000_000, 0)).toBe(15);
    expect(estimateCost("claude-opus-4-6", 0, 1_000_000)).toBe(75);
    expect(estimateCost("claude-haiku-4-5-20251001", 1000, 500)).toBeCloseTo(0.0035, 6);
  });
});

describe("ProviderError", () => {
  it("carries its category and status", () => {
    const err = new ProviderError("rate-limit", "slow down", { status: 429 });
    expect(err.category).toBe("rate-limit");
    expect(err.status).toBe(429);
    expect(err).toBeInstanceOf(Error);
  });
});
