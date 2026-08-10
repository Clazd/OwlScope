"use client";

import { useCallback } from "react";
import { Button } from "@/components/common/Button";
import { MicroLabel } from "@/components/common/MicroLabel";
import { useToast } from "@/components/common/Toast";
import {
  GeneratedPrompt,
  IMAGE_LICENCE_NOTE,
  SourceImageCard,
  copyImageToClipboard,
  imageUrlFor,
  type VisualSource,
} from "@/components/common/VisualParts";
import type { ThreadPost, ThreadRecord } from "@/domain/studio/schema";
import { X_LIMIT } from "@/domain/studio/text";

/**
 * The thread, post by post.
 *
 * Each post is shown with everything that decides whether it can be published:
 * its own character count, its own findings from the validator, and its own
 * images. Nothing is aggregated. A thread that reported one number for five
 * posts would hide exactly the post that is over the limit.
 */

/**
 * Posts are separated by a rule rather than numbered.
 *
 * Numbering them ("1/5") would put literal text into every post, and schedulers
 * that split a pasted thread would post the markers too. Cutting a post
 * afterwards would also make every number after it wrong.
 */
export const THREAD_SEPARATOR = "\n\n---\n\n";

export function formatThread(posts: ReadonlyArray<{ text: string }>): string {
  return posts.map((post) => post.text).join(THREAD_SEPARATOR);
}

interface PostThreadProps {
  thread: ThreadRecord;
  sources: VisualSource[];
  /** The post currently having a brief written, so only that button spins. */
  writingIndex: number | null;
  rebuilding: boolean;
  onWritePrompt: (index: number) => void;
  onWriteMissing: () => void;
  onRebuild: () => void;
}

export function PostThread({
  thread,
  sources,
  writingIndex,
  rebuilding,
  onWritePrompt,
  onWriteMissing,
  onRebuild,
}: PostThreadProps) {
  const toast = useToast();
  const byId = new Map(sources.map((source) => [source.id, source]));

  const copyPost = useCallback(async (post: ThreadPost) => {
    try {
      await navigator.clipboard.writeText(post.text);
      toast.show(`Post ${post.index} copied.`);
    } catch {
      toast.show("Could not reach the clipboard.", "failure");
    }
  }, [toast]);

  const copyAll = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(formatThread(thread.posts));
      toast.show(`All ${thread.posts.length} posts copied, separated by ---.`);
    } catch {
      toast.show("Could not reach the clipboard.", "failure");
    }
  }, [thread.posts, toast]);

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

  // A post with no image and no brief is the one that will go out bare.
  const bare = thread.posts.filter((post) => post.imageSourceIds.length === 0 && !post.visualPrompt);

  const claimed = new Set(thread.posts.flatMap((post) => post.imageSourceIds));
  const spare = sources.filter((source) => source.image && !claimed.has(source.id));

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MicroLabel strong>Thread · {thread.posts.length} posts</MicroLabel>
        <div className="flex flex-wrap gap-1">
          <Button variant="secondary" className="px-2 py-1" onClick={() => void copyAll()}>
            Copy thread
          </Button>
          {bare.length > 0 && (
            <Button
              variant="quiet"
              className="px-2 py-1"
              disabled={writingIndex !== null || rebuilding}
              onClick={onWriteMissing}
            >
              {writingIndex !== null
                ? `Writing post ${writingIndex}…`
                : `Write ${bare.length} image prompt${bare.length > 1 ? "s" : ""} · ~${bare.length}k tokens`}
            </Button>
          )}
          <Button
            variant="quiet"
            className="px-2 py-1"
            disabled={rebuilding || writingIndex !== null}
            onClick={onRebuild}
          >
            {rebuilding ? "Rebuilding…" : "Rebuild"}
          </Button>
        </div>
      </div>

      <p className="type-small mt-2 text-ink-3">
        Post one at a time into X, in order, each as a reply to the last. “Copy thread” puts all of them on the
        clipboard separated by <span data-mono className="type-data">---</span>, with no numbering: a “1/5” in the
        text would be posted literally, and would be wrong the moment you cut a post.
      </p>

      <ol className="mt-4 space-y-4">
        {thread.posts.map((post) => (
          <li key={post.index}>
            <ThreadPostCard
              post={post}
              total={thread.posts.length}
              images={post.imageSourceIds.map((id) => byId.get(id)).filter((s): s is VisualSource => Boolean(s))}
              writing={writingIndex === post.index}
              disabled={writingIndex !== null || rebuilding}
              onCopy={() => void copyPost(post)}
              onCopyImage={copyImage}
              onCopyPrompt={copyPrompt}
              onWritePrompt={() => onWritePrompt(post.index)}
            />
          </li>
        ))}
      </ol>

      {spare.length > 0 && (
        <div className="mt-5 border-t border-rule pt-4">
          <MicroLabel>Harvested, not placed</MicroLabel>
          <p className="type-small mt-1 text-ink-3">
            No post cites these sources, so nothing above claimed their images. Attach one by hand if it fits.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {spare.map((source) => (
              <SourceImageCard key={source.id} source={source} compact onCopy={() => void copyImage(source)} />
            ))}
          </div>
        </div>
      )}

      <p className="type-small mt-4 text-ink-3">{IMAGE_LICENCE_NOTE}</p>
    </section>
  );
}

function ThreadPostCard({
  post,
  total,
  images,
  writing,
  disabled,
  onCopy,
  onCopyImage,
  onCopyPrompt,
  onWritePrompt,
}: {
  post: ThreadPost;
  total: number;
  images: VisualSource[];
  writing: boolean;
  disabled: boolean;
  onCopy: () => void;
  onCopyImage: (source: VisualSource) => void;
  onCopyPrompt: (prompt: string) => void;
  onWritePrompt: () => void;
}) {
  const over = post.characterCount > X_LIMIT;

  return (
    <div className="rounded-control border border-rule p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-2">
        <MicroLabel strong>
          {post.index} / {total}
          {post.index === 1 ? " · the post" : ""}
        </MicroLabel>
        <div className="flex flex-wrap items-center gap-3">
          <span data-mono className={`type-data ${over ? "text-unsupported" : "text-ink-3"}`}>
            {post.characterCount} / {X_LIMIT}
          </span>
          <Button variant="quiet" className="px-2 py-1" onClick={onCopy}>Copy</Button>
        </div>
      </div>

      <p className="type-body reading-column mt-3 whitespace-pre-wrap text-ink">{post.text}</p>

      {post.warnings.length > 0 && (
        <ul className="mt-3 space-y-1">
          {post.warnings.map((warning) => (
            <li key={warning} className="type-small text-unsupported">{warning}</li>
          ))}
        </ul>
      )}

      {images.length > 0 && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {images.map((source) => (
            <SourceImageCard key={source.id} source={source} compact onCopy={() => onCopyImage(source)} />
          ))}
        </div>
      )}

      {post.visualPrompt ? (
        <GeneratedPrompt
          prompt={post.visualPrompt}
          className="mt-3 border-t border-rule pt-3"
          onCopy={() => onCopyPrompt(post.visualPrompt?.prompt ?? "")}
        />
      ) : (
        images.length === 0 && (
          <div className="mt-3">
            <Button variant="quiet" className="px-2 py-1" disabled={disabled} onClick={onWritePrompt}>
              {writing ? "Writing…" : "Write an image prompt · ~1k tokens"}
            </Button>
          </div>
        )
      )}
    </div>
  );
}
