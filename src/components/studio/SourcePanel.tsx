"use client";

import { useState } from "react";
import { Button } from "@/components/common/Button";
import { MicroLabel } from "@/components/common/MicroLabel";
import { SourceDrawer } from "@/components/common/SourceDrawer";
import { TextInput } from "@/components/common/Field";
import type { Source } from "@/domain/studio/schema";
import { cn } from "@/lib/format/cn";
import { formatStamp } from "@/lib/format/display";
import { shortAge } from "./client";

interface SourcePanelProps {
  sources: Source[];
  openSourceId: string | null;
  onOpenSource: (id: string | null) => void;
  onAddUrl: (url: string) => void;
  busy: boolean;
}

/**
 * The right-hand region: what the post is allowed to claim, listed.
 *
 * Quality is a word, not a colour. Saturated colour means epistemic status of a
 * claim; where a source came from is a different axis and does not get to
 * borrow the palette.
 */
export function SourcePanel({ sources, openSourceId, onOpenSource, onAddUrl, busy }: SourcePanelProps) {
  const [url, setUrl] = useState("");
  const open = sources.find((source) => source.id === openSourceId) ?? null;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-baseline justify-between border-b border-rule px-4 py-3">
        <MicroLabel strong>Sources</MicroLabel>
        <span data-mono className="type-data text-ink-3">
          {sources.length}
        </span>
      </header>

      <div className="grow overflow-y-auto">
        {sources.length === 0 ? (
          <p className="type-small px-4 py-4 text-ink-3">
            Nothing retrieved yet. Research will fill this, or paste a link below.
          </p>
        ) : (
          <ul>
            {sources.map((source) => (
              <li key={source.id} className="border-b border-rule last:border-b-0">
                <button
                  type="button"
                  onClick={() => onOpenSource(source.id)}
                  className={cn(
                    "block w-full px-4 py-3 text-left transition-colors duration-(--dur-state)",
                    "hover:bg-surface-sunken",
                    openSourceId === source.id && "bg-surface-sunken",
                  )}
                >
                  <span data-mono className="type-data block truncate text-ink">
                    {source.domain || source.url}
                  </span>
                  <span className="type-small mt-1 block text-ink-3">
                    {source.sourceQuality} · {shortAge(source.publishedAt)}
                  </span>
                  <span className="type-small mt-1 line-clamp-2 block text-ink-2">{source.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form
        className="space-y-2 border-t border-rule px-4 py-3"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = url.trim();
          if (!trimmed) return;
          onAddUrl(trimmed);
          setUrl("");
        }}
      >
        <MicroLabel className="block">Add a link</MicroLabel>
        <TextInput
          mono
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://…"
          aria-label="Paste a URL to research"
          inputMode="url"
        />
        <Button type="submit" disabled={busy || url.trim().length === 0} className="w-full">
          Fetch and research
        </Button>
        <p className="type-small text-ink-3">
          Fetched on the server through the SSRF guard. Private addresses are refused.
        </p>
      </form>

      <SourceDrawer
        open={open !== null}
        onClose={() => onOpenSource(null)}
        title={open?.title ?? ""}
        subtitle={
          open
            ? `${open.domain} · ${open.sourceQuality} · ${
                open.publishedAt ? `published ${formatStamp(open.publishedAt)}` : "no publication date"
              }`
            : undefined
        }
      >
        {open && (
          <div className="space-y-4">
            <div>
              <MicroLabel className="mb-1 block">Id</MicroLabel>
              <p data-mono className="type-data text-ink-2">
                {open.id}
              </p>
            </div>
            <div>
              <MicroLabel className="mb-1 block">URL</MicroLabel>
              <a
                href={open.url}
                target="_blank"
                rel="noreferrer noopener"
                data-mono
                className="type-data break-all text-ink-2 underline hover:text-ink"
              >
                {open.url}
              </a>
            </div>
            <div>
              <MicroLabel className="mb-1 block">Retrieved</MicroLabel>
              <p data-mono className="type-data text-ink-2">
                {formatStamp(open.retrievedAt)} via {open.providerId}
              </p>
            </div>
            <div>
              <MicroLabel className="mb-1 block">What it says</MicroLabel>
              <p className="type-body whitespace-pre-wrap text-ink-2">
                {open.excerpt || "No text was retrieved from this page."}
              </p>
            </div>
          </div>
        )}
      </SourceDrawer>
    </div>
  );
}
