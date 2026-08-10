import { NextResponse } from "next/server";
import { sourceStore } from "@/domain/studio/store";
import { createLogger } from "@/lib/logging/log";
import { safeFetchBytes } from "@/lib/net/safe-fetch";
import {
  MAX_IMAGE_BYTES,
  extensionFor,
  normaliseType,
  readCachedImage,
  writeCachedImage,
} from "@/services/storage/image-cache";

const log = createLogger("api/studio/image");

export const dynamic = "force-dynamic";

/**
 * Serves a harvested source image from our own origin.
 *
 * The parameter is a source id, never a URL. That is the whole security design:
 * an endpoint that fetched whatever URL it was handed would be an open proxy
 * sitting inside the SSRF guard, reachable by anything that can reach this app.
 * Here the only fetchable URLs are the ones a harvest already wrote to a source
 * record, and every one of those still goes through `safeFetchBytes`.
 *
 * Proxying rather than hotlinking also means the browser never announces to a
 * publisher which posts the user is looking at, and a "copy image" in the client
 * is a same-origin read rather than a tainted canvas.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const sourceId = params.get("sourceId");
  if (!sourceId) return NextResponse.json({ error: "Which source?" }, { status: 400 });

  const source = await sourceStore.get(sourceId);
  if (!source) return NextResponse.json({ error: "That source no longer exists." }, { status: 404 });
  if (!source.image) {
    return NextResponse.json({ error: "That source offers no shareable image." }, { status: 404 });
  }

  const target = source.image.url;
  const cached = await readCachedImage(target);
  if (cached) return respond(cached.bytes, cached.contentType, source.domain, params.has("download"));

  let fetched;
  try {
    fetched = await safeFetchBytes(target, { maxBytes: MAX_IMAGE_BYTES });
  } catch (err) {
    log.warn(`could not fetch the image at ${target}: ${(err as Error).message}`);
    return NextResponse.json({ error: `Could not fetch that image: ${(err as Error).message}` }, { status: 502 });
  }

  if (fetched.status >= 400) {
    return NextResponse.json({ error: `${source.domain} returned ${fetched.status} for its image.` }, { status: 502 });
  }

  const contentType = normaliseType(fetched.contentType);
  if (!contentType) {
    // A source page can nominate anything as its og:image, including an HTML
    // error page. Refusing here is what stops this route relaying it.
    log.warn(`${source.domain} served ${fetched.contentType ?? "no content type"} for its image`);
    return NextResponse.json(
      { error: `${source.domain} served ${fetched.contentType ?? "an unknown type"}, which is not an image.` },
      { status: 415 },
    );
  }

  await writeCachedImage(target, fetched.bytes, contentType);
  return respond(Buffer.from(fetched.bytes), contentType, source.domain, params.has("download"));
}

function respond(bytes: Buffer, contentType: string, domain: string, download: boolean): NextResponse {
  const headers: Record<string, string> = {
    "content-type": contentType,
    "content-length": String(bytes.byteLength),
    // Local cache only. These bytes belong to the publisher; nothing about them
    // should end up in a shared cache.
    "cache-control": "private, max-age=3600",
    // The image is a third party's, so it gets no more trust than it needs.
    "content-security-policy": "default-src 'none'; sandbox",
    "x-content-type-options": "nosniff",
  };
  if (download) {
    const name = `${domain.replace(/[^a-z0-9.-]/gi, "-") || "source"}.${extensionFor(contentType)}`;
    headers["content-disposition"] = `attachment; filename="${name}"`;
  }
  return new NextResponse(new Uint8Array(bytes), { headers });
}
