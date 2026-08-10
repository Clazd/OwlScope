"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/common/Button";
import { MicroLabel } from "@/components/common/MicroLabel";
import { PostThread } from "@/components/common/PostThread";
import { useToast } from "@/components/common/Toast";
import {
  GeneratedPrompt,
  IMAGE_LICENCE_NOTE,
  SourceImageCard,
  copyImageToClipboard,
  imageUrlFor,
  type VisualSource,
} from "@/components/common/VisualParts";
import type { ThreadRecord, VisualPromptRecord } from "@/domain/studio/schema";

/**
 * The pictures that go with a post, and the thread it can become.
 *
 * Three different things share this panel, and the difference between them
 * matters enough to be visible in the layout. Images the sources themselves
 * nominated for sharing: still somebody else's work, shown with the domain and
 * credit attached. Briefs for images the user generates and therefore owns. And
 * the thread, where both of those become per-post rather than per-panel, because
 * a five-post thread with one picture is a five-post thread with four bare posts.
 *
 * The harvest costs no tokens, so it runs on view. Everything that costs money
 * is a button with the price on it.
 */

interface VisualPayload {
  sources: VisualSource[];
  unreachable: string[];
  visualPrompt: VisualPromptRecord | null;
  thread: ThreadRecord | null;
}

interface PostVisualProps {
  contentId: string;
  className?: string;
}

export function PostVisual({ contentId, className }: PostVisualProps) {
  const toast = useToast();
  const [payload, setPayload] = useState<VisualPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [writing, setWriting] = useState(false);
  const [writingIndex, setWritingIndex] = useState<number | null>(null);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState("");

  // Mounted per content item - the caller keys on the id - so the initial state
  // is always the right one and this effect never has to reset anything.
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/studio/visual?contentId=${encodeURIComponent(contentId)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = await response.json() as VisualPayload & { error?: string };
        if (!response.ok) throw new Error(body.error ?? "The sources could not be read.");
        setPayload(body);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "The sources could not be read.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [contentId]);

  /** Resolves false when the call was refused, so a bulk pass stops rather than repeating it. */
  const writePrompt = useCallback(async (postIndex?: number): Promise<boolean> => {
    if (postIndex) setWritingIndex(postIndex);
    else setWriting(true);
    try {
      const response = await fetch("/api/studio/visual", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contentId, postIndex }),
      });
      const body = await response.json() as {
        visualPrompt?: VisualPromptRecord;
        thread?: ThreadRecord | null;
        error?: string;
      };
      if (!response.ok) throw new Error(body.error ?? "The image prompt could not be written.");
      setPayload((current) => current
        ? {
            ...current,
            visualPrompt: postIndex ? current.visualPrompt : (body.visualPrompt ?? null),
            thread: body.thread ?? current.thread,
          }
        : current);
      return true;
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "The image prompt could not be written.", "failure");
      return false;
    } finally {
      setWritingIndex(null);
      setWriting(false);
    }
  }, [contentId, toast]);

  /**
   * One call per post, in order, stopping on the first refusal. A loop that
   * carried on would turn a spent budget into five identical error toasts.
   */
  const writeMissing = useCallback(async () => {
    const bare = payload?.thread?.posts.filter(
      (post) => post.imageSourceIds.length === 0 && !post.visualPrompt,
    ) ?? [];
    for (const post of bare) {
      const ok = await writePrompt(post.index);
      if (!ok) return;
    }
  }, [payload, writePrompt]);

  const buildThread = useCallback(async () => {
    setBuilding(true);
    try {
      const response = await fetch("/api/studio/thread", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contentId }),
      });
      const body = await response.json() as { thread?: ThreadRecord; error?: string };
      if (!response.ok) throw new Error(body.error ?? "The thread could not be written.");
      setPayload((current) => current ? { ...current, thread: body.thread ?? null } : current);
      toast.show(`Thread of ${body.thread?.posts.length ?? 0} posts. Check each one before you post it.`);
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "The thread could not be written.", "failure");
    } finally {
      setBuilding(false);
    }
  }, [contentId, toast]);

  const copyImage = useCallback(async (source: VisualSource) => {
    try {
      await copyImageToClipboard(imageUrlFor(source.id));
      toast.show(`Image from ${source.domain} copied. Credit it when you post.`);
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "That image could not be copied.", "failure");
    }
  }, [toast]);

  const copyPrompt = useCallback(async (prompt: string) => {
    try {
      await navigator.clipboard.writeText(prompt);
      toast.show("Image prompt copied.");
    } catch {
      toast.show("Could not reach the clipboard.", "failure");
    }
  }, [toast]);

  const thread = payload?.thread ?? null;
  const withImages = payload?.sources.filter((source) => source.image) ?? [];
  const prompt = payload?.visualPrompt ?? null;

  return (
    <section className={className}>
      {loading && <p data-mono className="type-data text-ink-3">Reading the sources for a shareable image…</p>}
      {error && <p className="type-small text-unsupported">{error}</p>}

      {/* Once a thread exists it owns the images: they are assigned per post, and
          repeating them above would show the same card twice on one screen. */}
      {!loading && !error && !thread && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <MicroLabel strong>Image</MicroLabel>
            <div className="flex flex-wrap gap-1">
              {!prompt && (
                <Button variant="quiet" className="px-2 py-1" disabled={writing || building} onClick={() => void writePrompt()}>
                  {writing ? "Writing…" : "Write an image prompt · ~1k tokens"}
                </Button>
              )}
              <Button variant="quiet" className="px-2 py-1" disabled={building || writing} onClick={() => void buildThread()}>
                {building ? "Writing the thread…" : "Make it a thread · ~5k tokens"}
              </Button>
            </div>
          </div>

          {withImages.length > 0 && (
            <>
              <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {withImages.map((source) => (
                  <SourceImageCard key={source.id} source={source} onCopy={() => void copyImage(source)} />
                ))}
              </div>
              <p className="type-small mt-3 text-ink-3">{IMAGE_LICENCE_NOTE}</p>
            </>
          )}

          {withImages.length === 0 && (
            <p className="type-body mt-2 text-ink-2">
              None of the {payload?.sources.length ?? 0} sources offer a shareable image
              {payload && payload.unreachable.length > 0 ? `, and ${payload.unreachable.join(", ")} could not be read` : ""}.
              {!prompt && " Write a prompt and generate one instead."}
            </p>
          )}

          {prompt && <GeneratedPrompt prompt={prompt} onCopy={() => void copyPrompt(prompt.prompt)} />}
        </>
      )}

      {!loading && !error && thread && (
        <PostThread
          thread={thread}
          sources={payload?.sources ?? []}
          writingIndex={writingIndex}
          rebuilding={building}
          onWritePrompt={(index) => void writePrompt(index)}
          onWriteMissing={() => void writeMissing()}
          onRebuild={() => void buildThread()}
        />
      )}
    </section>
  );
}
