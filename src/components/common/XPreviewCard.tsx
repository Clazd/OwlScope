import { countCharacters, X_LIMIT } from "@/domain/studio/text";
import { cn } from "@/lib/format/cn";

interface XPreviewCardProps {
  handle: string;
  displayName: string;
  text: string;
  /** Relative timestamp, e.g. "2m". Formatted by the caller. */
  timestamp?: string;
  className?: string;
}

/**
 * A faithful X preview, and the one deliberate type exception in the product:
 * the platform's own sans stack at 15px / 1.3125, because a preview rendered in
 * our type ramp is not an honest preview of what the post will look like.
 *
 * The character counter uses the platform's weighting — a URL counts as 23
 * characters however long it is — so the number here is the number X will show.
 *
 * There are no engagement affordances. No like button, no counts, no reply
 * icon. It is a preview, not a simulation, and inventing a number of likes
 * would be the same class of lie as inventing a source.
 */
export function XPreviewCard({
  handle,
  displayName,
  text,
  timestamp = "now",
  className,
}: XPreviewCardProps) {
  const length = countCharacters(text);
  const over = length > X_LIMIT;
  const initial = displayName.trim().charAt(0).toUpperCase() || "◆";

  return (
    <figure className={cn("rounded-card border border-rule bg-surface p-4", className)}>
      <div className="flex gap-3">
        <span
          aria-hidden
          className="type-body-strong flex size-8 shrink-0 items-center justify-center rounded-pill bg-surface-sunken text-ink-2"
        >
          {initial}
        </span>

        <div className="min-w-0 grow">
          <div
            className="flex flex-wrap items-baseline gap-1"
            // The type exception, declared inline so it cannot be applied
            // anywhere else by accident.
            style={{ font: '400 15px/1.3125 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
          >
            <span className="font-semibold text-ink">{displayName}</span>
            <span className="text-ink-3">@{handle}</span>
            <span aria-hidden className="text-ink-3">
              ·
            </span>
            <span className="text-ink-3">{timestamp}</span>
          </div>

          <p
            className="mt-1 whitespace-pre-wrap break-words text-ink"
            style={{ font: '400 15px/1.3125 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
          >
            {text}
          </p>
        </div>
      </div>

      <figcaption className="mt-3 flex items-center justify-between border-t border-rule pt-2">
        <span data-mono className="type-micro text-ink-3">
          preview · no engagement shown
        </span>
        <span data-mono className={cn("type-data", over ? "text-unsupported" : "text-ink-3")}>
          {length}/{X_LIMIT}
        </span>
      </figcaption>
    </figure>
  );
}
