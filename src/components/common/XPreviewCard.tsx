import { cn } from "@/lib/format/cn";

interface XPreviewCardProps {
  handle: string;
  displayName: string;
  text: string;
  className?: string;
}

const X_LIMIT = 280;

/**
 * A faithful X preview — STUB.
 *
 * The real card lands in slice 3 along with its one deliberate type exception:
 * this is the only component allowed to use the platform's own sans stack at
 * 15px, because a preview rendered in our type ramp is not an honest preview.
 * That exception is declared here so nobody has to rediscover it later.
 *
 * Slice 1 ships the frame, the character count and the over-limit state.
 */
export function XPreviewCard({ handle, displayName, text, className }: XPreviewCardProps) {
  const length = [...text].length;
  const over = length > X_LIMIT;

  return (
    <figure className={cn("rounded-card border border-rule bg-surface p-4", className)}>
      <div className="flex items-baseline gap-2">
        <span className="type-body-strong text-ink">{displayName}</span>
        <span data-mono className="type-data text-ink-3">
          @{handle}
        </span>
      </div>
      <p
        className="mt-2 whitespace-pre-wrap text-ink"
        // The one type exception in the product, declared inline so it is
        // impossible to apply it anywhere else by accident.
        style={{
          font: '400 15px/1.3125 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        {text}
      </p>
      <figcaption className="mt-3 flex items-center justify-between border-t border-rule pt-2">
        <span data-mono className="type-micro text-ink-3">
          preview only
        </span>
        <span data-mono className={cn("type-data", over ? "text-unsupported" : "text-ink-3")}>
          {length}/{X_LIMIT}
        </span>
      </figcaption>
    </figure>
  );
}
