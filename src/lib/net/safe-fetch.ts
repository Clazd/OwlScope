import "server-only";
import { lookup } from "node:dns/promises";
import { createLogger } from "@/lib/logging/log";

const log = createLogger("net/safe-fetch");

export const SAFE_FETCH_LIMITS = {
  maxRedirects: 3,
  maxBytes: 2 * 1024 * 1024,
  timeoutMs: 10_000,
  userAgent: "PersonaStudio/0.1 (local research tool; +https://localhost)",
} as const;

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

function ipv4InPrivateRange(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a = 0, b = 0] = parts;
  if (a === 0) return true; // "this network"
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a === 192 && b === 0) return true; // IETF protocol assignments
  if (a >= 224) return true; // multicast, reserved, broadcast
  return false;
}

function ipv6InPrivateRange(ip: string): boolean {
  const addr = ip.toLowerCase().split("%")[0] ?? "";
  if (addr === "::" || addr === "::1") return true; // unspecified, loopback
  if (addr.startsWith("fe80")) return true; // link-local
  if (addr.startsWith("fc") || addr.startsWith("fd")) return true; // unique local
  if (addr.startsWith("ff")) return true; // multicast
  // IPv4-mapped (::ffff:10.0.0.1) inherits the IPv4 rules.
  const mapped = addr.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) return ipv4InPrivateRange(mapped[1]);
  return false;
}

export function isBlockedAddress(ip: string, family: number): boolean {
  return family === 6 ? ipv6InPrivateRange(ip) : ipv4InPrivateRange(ip);
}

/**
 * Resolves the host and refuses anything that points at the loopback interface,
 * a private range, or a cloud metadata endpoint. Checked on every hop, because
 * a public URL that 302s to 169.254.169.254 is the whole attack.
 */
export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError(`Not a URL: ${rawUrl}`);
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new UnsafeUrlError(`Only http and https are allowed, not ${url.protocol}`);
  }

  const host = url.hostname.replace(/^\[|\]$/g, "");

  // Literal IPs skip DNS but not the range check.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    if (ipv4InPrivateRange(host)) throw new UnsafeUrlError(`${host} is a private or loopback address`);
    return url;
  }
  if (host.includes(":")) {
    if (ipv6InPrivateRange(host)) throw new UnsafeUrlError(`${host} is a private or loopback address`);
    return url;
  }
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new UnsafeUrlError(`${host} resolves to this machine`);
  }

  let addresses;
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new UnsafeUrlError(`Could not resolve ${host}`);
  }
  if (addresses.length === 0) throw new UnsafeUrlError(`${host} resolves to nothing`);
  for (const { address, family } of addresses) {
    if (isBlockedAddress(address, family)) {
      throw new UnsafeUrlError(`${host} resolves to ${address}, which is private or loopback`);
    }
  }
  return url;
}

export interface SafeFetchResult {
  url: string;
  status: number;
  contentType: string | null;
  body: string;
  truncated: boolean;
}

/**
 * The only way user-supplied URLs are ever fetched. Follows redirects by hand
 * so every hop is re-validated, caps the body, and always times out.
 */
export async function safeFetch(rawUrl: string): Promise<SafeFetchResult> {
  let target = await assertPublicUrl(rawUrl);

  for (let hop = 0; hop <= SAFE_FETCH_LIMITS.maxRedirects; hop += 1) {
    const response = await fetch(target, {
      redirect: "manual",
      headers: {
        "user-agent": SAFE_FETCH_LIMITS.userAgent,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
      },
      signal: AbortSignal.timeout(SAFE_FETCH_LIMITS.timeoutMs),
    });

    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      if (hop === SAFE_FETCH_LIMITS.maxRedirects) {
        throw new UnsafeUrlError(`More than ${SAFE_FETCH_LIMITS.maxRedirects} redirects from ${rawUrl}`);
      }
      target = await assertPublicUrl(new URL(location, target).toString());
      log.debug(`redirect ${hop + 1} -> ${target.hostname}`);
      continue;
    }

    const { body, truncated } = await readCapped(response);
    return {
      url: target.toString(),
      status: response.status,
      contentType: response.headers.get("content-type"),
      body,
      truncated,
    };
  }

  throw new UnsafeUrlError(`Too many redirects from ${rawUrl}`);
}

async function readCapped(response: Response): Promise<{ body: string; truncated: boolean }> {
  if (!response.body) return { body: "", truncated: false };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytes = 0;
  let truncated = false;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > SAFE_FETCH_LIMITS.maxBytes) {
      truncated = true;
      await reader.cancel().catch(() => {});
      break;
    }
    chunks.push(decoder.decode(value, { stream: true }));
  }
  chunks.push(decoder.decode());
  return { body: chunks.join(""), truncated };
}
