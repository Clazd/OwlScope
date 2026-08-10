import { afterEach, describe, expect, it, vi } from "vitest";
import { SAFE_FETCH_LIMITS, assertPublicUrl, isBlockedAddress, safeFetch, safeFetchBytes } from "./safe-fetch";

afterEach(() => vi.unstubAllGlobals());

describe("SSRF guard", () => {
  it("blocks the ranges that make SSRF worth doing", () => {
    const blocked = [
      "127.0.0.1", // loopback
      "0.0.0.0", // this network
      "10.1.2.3", // private
      "172.16.0.1", // private
      "172.31.255.254", // private, top of range
      "192.168.1.1", // private
      "169.254.169.254", // link-local: cloud metadata
      "100.64.0.1", // carrier-grade NAT
      "224.0.0.1", // multicast
      "255.255.255.255", // broadcast
    ];
    for (const ip of blocked) {
      expect(isBlockedAddress(ip, 4), `${ip} should be blocked`).toBe(true);
    }
  });

  it("allows ordinary public addresses", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "93.184.216.34"]) {
      expect(isBlockedAddress(ip, 4), `${ip} should be allowed`).toBe(false);
    }
  });

  it("blocks the IPv6 equivalents, including IPv4-mapped ones", () => {
    for (const ip of ["::1", "::", "fe80::1", "fd00::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:169.254.169.254"]) {
      expect(isBlockedAddress(ip, 6), `${ip} should be blocked`).toBe(true);
    }
    expect(isBlockedAddress("2606:4700:4700::1111", 6)).toBe(false);
  });

  it("rejects a literal private address before any DNS lookup", async () => {
    await expect(assertPublicUrl("http://169.254.169.254/latest/meta-data/")).rejects.toThrow(/private or loopback/);
    await expect(assertPublicUrl("http://[::1]:8080/")).rejects.toThrow(/private or loopback/);
  });

  it("rejects hostnames that mean this machine", async () => {
    await expect(assertPublicUrl("http://localhost:3000/")).rejects.toThrow(/this machine/);
    await expect(assertPublicUrl("http://printer.local/")).rejects.toThrow(/this machine/);
  });

  it("rejects schemes that are not http or https", async () => {
    await expect(assertPublicUrl("file:///etc/passwd")).rejects.toThrow(/Only http and https/);
    await expect(assertPublicUrl("gopher://example.com/")).rejects.toThrow(/Only http and https/);
  });

  it("rejects something that is not a URL at all", async () => {
    await expect(assertPublicUrl("not a url")).rejects.toThrow(/Not a URL/);
  });

  it("caps redirects, body size and time, and identifies itself", () => {
    expect(SAFE_FETCH_LIMITS.maxRedirects).toBe(3);
    expect(SAFE_FETCH_LIMITS.maxBytes).toBe(2 * 1024 * 1024);
    expect(SAFE_FETCH_LIMITS.timeoutMs).toBe(10_000);
    expect(SAFE_FETCH_LIMITS.userAgent).toMatch(/GroundedVoice/);
  });

  it("does not forward credentials to another origin after a redirect", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://1.1.1.1/final" } }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", request);
    await safeFetch("https://93.184.216.34/start", { headers: { authorization: "Bearer secret", "x-test": "kept" } });
    expect(request.mock.calls[0]?.[1]?.headers.authorization).toBe("Bearer secret");
    expect(request.mock.calls[1]?.[1]?.headers.authorization).toBeUndefined();
    expect(request.mock.calls[1]?.[1]?.headers["x-test"]).toBe("kept");
  });
});

describe("binary fetch", () => {
  it("returns the bytes and the content type", async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(bytes, { status: 200, headers: { "content-type": "image/jpeg" } }),
    ));
    const result = await safeFetchBytes("https://93.184.216.34/card.jpg");
    expect(result.contentType).toBe("image/jpeg");
    expect(Array.from(result.bytes)).toEqual([0xff, 0xd8, 0xff, 0xe0]);
  });

  it("refuses a body that declares itself over the cap before reading it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1]), { status: 200, headers: { "content-type": "image/png", "content-length": "9999" } }),
    ));
    await expect(safeFetchBytes("https://93.184.216.34/big.png", { maxBytes: 100 })).rejects.toThrow(/over the 100-byte cap/);
  });

  it("refuses a body that goes over the cap while streaming, content-length or not", async () => {
    // A server that lies about or omits content-length must not get a free pass.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(new Uint8Array(500), { status: 200, headers: { "content-type": "image/png" } }),
    ));
    await expect(safeFetchBytes("https://93.184.216.34/big.png", { maxBytes: 100 })).rejects.toThrow(/larger than the 100-byte cap/);
  });

  it("re-validates every redirect hop, same as the text reader", async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } }),
    );
    vi.stubGlobal("fetch", request);
    await expect(safeFetchBytes("https://93.184.216.34/start.png")).rejects.toThrow(/private or loopback/);
  });
});
