"use client";

import { cn } from "@/lib/format/cn";

export interface Reason {
  id: string;
  label: string;
}

interface ReasonChipsProps {
  reasons: Reason[];
  selected: string[];
  onChange: (next: string[]) => void;
  className?: string;
}

/**
 * Multi-select chips shown after a rejection.
 *
 * Selection is ink, not colour: this is feedback about a choice, not a claim
 * about truth. What the user picks here tunes selection, never identity — the
 * persona changes only when the user edits it directly.
 */
export function ReasonChips({ reasons, selected, onChange, className }: ReasonChipsProps) {
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((r) => r !== id) : [...selected, id]);
  }

  return (
    <div className={cn("flex flex-wrap gap-2", className)} role="group" aria-label="Reasons">
      {reasons.map((reason) => {
        const active = selected.includes(reason.id);
        return (
          <button
            key={reason.id}
            type="button"
            aria-pressed={active}
            onClick={() => toggle(reason.id)}
            className={cn(
              "type-small rounded-pill border px-3 py-1",
              "transition-colors duration-(--dur-state) ease-(--ease)",
              active
                ? "border-ink bg-ink text-bg"
                : "border-rule-strong bg-surface text-ink-2 hover:bg-surface-sunken hover:text-ink",
            )}
          >
            {reason.label}
          </button>
        );
      })}
    </div>
  );
}
