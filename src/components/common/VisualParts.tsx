"use client";

import { Button } from "@/components/common/Button";
import { MicroLabel } from "@/components/common/MicroLabel";
import type { SourceImage, SourceQuality, VisualPromptRecord } from "@/domain/studio/schema";

/**
 * The pieces the visual panel and the thread panel both need.
 *
 * They live together because they have to stay identical in both places: an
 * image shown inside a thread is no less somebody else's than the same image
 * shown on its own, and the credit line that says so is part of the component
 * rather than something each caller remembers to add.
 */

export interface VisualSource {
  id: string;
  title: string;
  domain: string;
  url: string;
  quality: SourceQuality;
  image: SourceImage | null;
  checked: boolean;
}

/** Our own origin, always. The publisher never learns which posts are being read. */
export function imageUrlFor(sourceId: string, download = false): string {
  return `/api/studio/image?sourceId=${encodeURIComponent(sourceId)}${download ? "&download=1" : ""}`;
}

/**
 * The clipboard takes PNG and, in practice, nothing else. Source images are
 * usually JPEG or WebP, so they are redrawn through a canvas - which works only
 * because the bytes come from our own origin and the canvas is not tainted.
 */
export async function copyImageToClipboard(url: string): Promise<void> {
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
    throw new Error("This browser cannot put an image on the clipboard. Use Save instead.");
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error("That image could not be fetched.");
  const blob = await response.blob();

  if (blob.type === "image/png") {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return;
  }

  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not convert the image to PNG.");
  context.drawImage(bitmap, 0, 0);
  bitmap.close();

  const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!png) throw new Error("This browser could not convert the image to PNG.");
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}

export function SourceImageCard({
  source,
  onCopy,
  compact = false,
}: {
  source: VisualSource;
  onCopy: () => void;
  /** Inside a thread post, where several images share one post's width. */
  compact?: boolean;
}) {
  const image = source.image;
  if (!image) return null;

  return (
    <figure className="overflow-hidden rounded-control border border-rule">
      {/* eslint-disable-next-line @next/next/no-img-element -- proxied third-party bytes of unknown dimensions; the optimiser would fetch them a second time */}
      <img
        src={imageUrlFor(source.id)}
        alt={image.alt || `Image published by ${source.domain}`}
        loading="lazy"
        className={`block w-full bg-surface-sunken object-cover ${compact ? "h-28" : "h-40"}`}
      />
      <figcaption className="space-y-2 border-t border-rule p-3">
        <p data-mono className="type-data truncate text-ink-3" title={source.title}>
          {source.domain}{image.credit && image.credit !== source.domain ? ` · ${image.credit}` : ""}
        </p>
        <div className="flex flex-wrap gap-1">
          <Button variant="quiet" className="px-2 py-1" onClick={onCopy}>Copy</Button>
          <a
            href={imageUrlFor(source.id, true)}
            download
            className="type-body-strong inline-flex items-center rounded-control px-2 py-1 text-ink-2 hover:bg-surface-sunken hover:text-ink"
          >
            Save
          </a>
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="type-body-strong inline-flex items-center rounded-control px-2 py-1 text-ink-2 hover:bg-surface-sunken hover:text-ink"
          >
            Source
          </a>
        </div>
      </figcaption>
    </figure>
  );
}

export function GeneratedPrompt({
  prompt,
  onCopy,
  className = "mt-4 border-t border-rule pt-4",
}: {
  prompt: VisualPromptRecord;
  onCopy: () => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="type-body text-ink">{prompt.concept}</p>
        <MicroLabel>{prompt.aspectRatio} · {prompt.model}</MicroLabel>
      </div>
      <p data-mono className="type-data mt-2 whitespace-pre-wrap rounded-control border border-rule bg-surface-sunken p-3 text-ink-2">
        {prompt.prompt}
      </p>
      {prompt.negativePrompt && (
        <p data-mono className="type-data mt-2 text-ink-3">Avoid: {prompt.negativePrompt}</p>
      )}
      {prompt.altText && (
        <p className="type-small mt-2 text-ink-3">Alt text: {prompt.altText}</p>
      )}
      <Button variant="secondary" className="mt-3" onClick={onCopy}>Copy prompt</Button>
    </div>
  );
}

/** The one line that has to appear wherever harvested images do. */
export const IMAGE_LICENCE_NOTE =
  "These belong to the sites that published them. Credit the domain when you post one, and use a generated " +
  "prompt instead if you need an image that is unambiguously yours.";
