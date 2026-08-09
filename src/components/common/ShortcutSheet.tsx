"use client";

import { useRef } from "react";
import { useCommands } from "./command-registry";
import { MicroLabel } from "./MicroLabel";
import { useDialogFocus } from "./use-dialog-focus";

const SHORTCUTS: Array<{ keys: string; action: string }> = [
  { keys: "Cmd/Ctrl K", action: "Command palette" },
  { keys: "G then T", action: "Go to Today" },
  { keys: "G then B", action: "Go to Brain" },
  { keys: "G then R", action: "Go to Radar" },
  { keys: "G then S", action: "Go to Studio" },
  { keys: "G then M", action: "Go to Memory" },
  { keys: "Esc", action: "Close drawer, sheet, or palette" },
  { keys: "?", action: "Show this list" },
];

/** The `?` sheet. Deliberately a plain table - it is a reference, not a tour. */
export function ShortcutSheet() {
  const { shortcutsOpen, setShortcutsOpen } = useCommands();
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useDialogFocus<HTMLDivElement>(shortcutsOpen, () => setShortcutsOpen(false), closeRef);
  if (!shortcutsOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 px-4">
      <button
        type="button"
        aria-label="Close shortcuts"
        tabIndex={-1}
        onClick={() => setShortcutsOpen(false)}
        className="fixed inset-0 cursor-default"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        tabIndex={-1}
        className="relative w-full max-w-[420px] rounded-card border border-rule bg-surface p-6 shadow-pop"
      >
        <h2 className="type-h2 mb-4 text-ink">Keyboard</h2>
        <dl className="divide-y divide-rule">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.keys} className="flex items-baseline justify-between gap-4 py-2">
              <dt className="type-body text-ink-2">{shortcut.action}</dt>
              <dd>
                <MicroLabel strong>{shortcut.keys}</MicroLabel>
              </dd>
            </div>
          ))}
        </dl>
        <button
          ref={closeRef}
          type="button"
          onClick={() => setShortcutsOpen(false)}
          className="type-small mt-4 text-ink-3 hover:text-ink"
        >
          Close
        </button>
      </div>
    </div>
  );
}
