"use client";

import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/format/cn";
import { MicroLabel } from "./MicroLabel";
import { useDialogFocus } from "./use-dialog-focus";

interface SourceDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Mono line under the title: a domain, a date, a count. */
  subtitle?: ReactNode;
  children: ReactNode;
}

/**
 * A 420px slide-over from the right. Used for sources, and for anything else
 * that is reference material rather than the thing you are working on.
 *
 * Escape closes it, focus moves in on open and back out on close, and the panel
 * is the only surface in the product besides toasts and popovers that gets a
 * shadow.
 */
export function SourceDrawer({ open, onClose, title, subtitle, children }: SourceDrawerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useDialogFocus<HTMLDivElement>(open, onClose, closeRef);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        aria-label="Close panel"
        onClick={onClose}
        tabIndex={-1}
        className="grow cursor-default bg-ink/20"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          "flex h-full w-full max-w-[var(--drawer-width)] flex-col",
          "border-l border-rule bg-surface shadow-pop",
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-rule px-6 py-4">
          <div className="min-w-0">
            <h2 className="type-h2 text-ink truncate">{title}</h2>
            {subtitle && <MicroLabel className="mt-1 block">{subtitle}</MicroLabel>}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="type-micro rounded-control px-2 py-1 text-ink-3 hover:bg-surface-sunken hover:text-ink"
          >
            Close
          </button>
        </header>
        <div className="grow overflow-y-auto px-6 py-4">{children}</div>
      </div>
    </div>
  );
}
