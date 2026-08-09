import { afterEach, describe, expect, it, vi } from "vitest";
import { SAFE_FETCH_LIMITS, assertPublicUrl, isBlockedAddress, safeFetch } from "./safe-fetch";

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
