"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/format/cn";
import { MicroLabel } from "./MicroLabel";
import { useCommands, type Command } from "./command-registry";

function score(command: Command, query: string): boolean {
  if (!query) return true;
  const haystack = `${command.label} ${command.group} ${command.keywords ?? ""}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((term) => haystack.includes(term));
}

/**
 * Cmd/Ctrl+K. Registry-based, so later slices add commands from their own pages
 * without touching this file.
 *
 * The body is a separate component that only exists while the palette is open,
 * so each opening starts from a clean query and cursor without an effect
 * reaching back to reset them.
 */
export function CommandPalette() {
  const { open } = useCommands();
  if (!open) return null;
  return <Palette />;
}

function Palette() {
  const { commands, setOpen } = useCommands();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => commands.filter((command) => score(command, query)), [commands, query]);

  // Focusing an input is a DOM side effect, which is what effects are for.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Clamped on read rather than corrected in an effect: filtering can shrink
  // the list under the cursor at any keystroke.
  const active = Math.min(cursor, Math.max(0, matches.length - 1));

  function runAt(index: number) {
    const command = matches[index];
    if (!command) return;
    setOpen(false);
    command.run();
  }

  const groups = matches.reduce<Record<string, Command[]>>((acc, command) => {
    (acc[command.group] ??= []).push(command);
    return acc;
  }, {});

  let flatIndex = -1;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/20 px-4 pt-16">
      <button type="button" aria-label="Close command palette" onClick={() => setOpen(false)} className="fixed inset-0 cursor-default" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative w-full max-w-[560px] overflow-hidden rounded-card border border-rule bg-surface shadow-pop"
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setCursor((c) => Math.min(matches.length - 1, c + 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setCursor((c) => Math.max(0, c - 1));
            } else if (event.key === "Enter") {
              event.preventDefault();
              runAt(active);
            } else if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
            }
          }}
          placeholder="Type a command"
          aria-label="Command"
          className="type-body w-full border-b border-rule bg-transparent px-4 py-3 text-ink outline-none placeholder:text-ink-3"
        />

        <div className="max-h-[320px] overflow-y-auto py-2">
          {matches.length === 0 && <p className="type-small px-4 py-3 text-ink-3">No command matches that.</p>}

          {Object.entries(groups).map(([group, groupCommands]) => (
            <div key={group} className="py-1">
              <MicroLabel className="block px-4 py-1">{group}</MicroLabel>
              {groupCommands.map((command) => {
                flatIndex += 1;
                const index = flatIndex;
                const isActive = index === active;
                return (
                  <button
                    key={command.id}
                    type="button"
                    onMouseEnter={() => setCursor(index)}
                    onClick={() => runAt(index)}
                    className={cn(
                      "flex w-full items-center justify-between gap-4 px-4 py-2 text-left",
                      isActive ? "bg-surface-sunken text-ink" : "text-ink-2",
                    )}
                  >
                    <span className="type-body">{command.label}</span>
                    {command.shortcut && (
                      <span data-mono className="type-micro text-ink-3">
                        {command.shortcut}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
