import { cn } from "@/lib/format/cn";

export type GlyphName = "today" | "brain" | "radar" | "studio" | "memory" | "settings";

/**
 * Six hand-drawn glyphs, one per area, so the collapsed rail stays navigable
 * at 56px. Deliberately geometric and drawn in currentColor: no icon library,
 * no icon font, nothing to keep in sync with a design tool.
 *
 * They appear only in the nav. Nowhere else in the product uses an icon -
 * empty states, buttons and headers are all words.
 */
export function Glyph({ name, className }: { name: GlyphName; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      focusable="false"
      className={cn("size-4 shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {name === "today" && (
        <>
          <rect x="2.5" y="3" width="11" height="10.5" rx="1.5" />
          <path d="M2.5 6.5h11" />
          <path d="M5.5 9.5h5" />
        </>
      )}
      {name === "brain" && (
        <>
          <circle cx="8" cy="8" r="5.5" />
          <path d="M8 2.5v11" />
          <path d="M5 4.6c1.6 1.2 1.6 5.6 0 6.8" />
        </>
      )}
      {name === "radar" && (
        <>
          <circle cx="8" cy="8" r="5.5" />
          <circle cx="8" cy="8" r="2.25" />
          <path d="M8 8l3.9-3.9" />
        </>
      )}
      {name === "studio" && (
        <>
          <path d="M3 12.5h10" />
          <path d="M4.5 9.5l6-6 2 2-6 6H4.5z" />
        </>
      )}
      {name === "memory" && (
        <>
          <path d="M2.5 5.5 8 2.75l5.5 2.75L8 8.25 2.5 5.5Z" />
          <path d="m2.5 8.75 5.5 2.75 5.5-2.75" />
          <path d="m2.5 11.75 5.5 2.75 5.5-2.75" />
        </>
      )}
      {name === "settings" && (
        <>
          <path d="M2.5 5h11M2.5 11h11" />
          <circle cx="6" cy="5" r="1.5" />
          <circle cx="10.5" cy="11" r="1.5" />
        </>
      )}
    </svg>
  );
}
