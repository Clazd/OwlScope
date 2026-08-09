"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/format/cn";
import { MicroLabel } from "@/components/common/MicroLabel";

/** Brain sections, in the order they appear. */
export const BRAIN_SECTIONS = [
  { id: "inbox", label: "Persona inbox" },
  { id: "identity", label: "Identity" },
  { id: "pillars", label: "Pillars" },
  { id: "beliefs", label: "Beliefs" },
  { id: "boundaries", label: "Boundaries" },
  { id: "fingerprint", label: "Voice fingerprint" },
  { id: "voice-rules", label: "Voice rules" },
  { id: "experience", label: "Experience log" },
  { id: "versions", label: "Versions" },
] as const;

export type SectionId = (typeof BRAIN_SECTIONS)[number]["id"];

interface SectionProps {
  id: SectionId;
  title: string;
  /** One line under the title. Says what this section is for. */
  intro?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}

/**
 * A titled block on the editing surface. Not a Card — these sections carry
 * Cards inside them, and a bordered card inside a bordered card is the one
 * nesting the design system rules out.
 */
export function Section({ id, title, intro, action, children }: SectionProps) {
  return (
    <section id={id} className="scroll-mt-4 border-t border-rule pt-6 first:border-t-0 first:pt-0">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="type-h2 text-ink">{title}</h2>
          {intro && <p className="type-small mt-1 max-w-[520px] text-ink-3">{intro}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

/**
 * The section index. A sticky rail on desktop, a horizontal scrolling strip
 * pinned under the header on mobile.
 *
 * The active section comes from an IntersectionObserver rather than a scroll
 * handler, so it costs nothing while the user is reading.
 */
export function SectionIndex({ counts }: { counts?: Partial<Record<SectionId, number>> }) {
  const [active, setActive] = useState<SectionId>("identity");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id as SectionId);
      },
      // A band across the upper third: the section you are reading, not the
      // one that happens to touch the top edge.
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 },
    );

    for (const section of BRAIN_SECTIONS) {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <nav aria-label="Brain sections" className="wide:sticky wide:top-4">
      <ul className="flex gap-1 overflow-x-auto wide:block wide:overflow-visible">
        {BRAIN_SECTIONS.map((section) => {
          const isActive = section.id === active;
          const count = counts?.[section.id];
          return (
            <li key={section.id} className="shrink-0 wide:shrink">
              <a
                href={`#${section.id}`}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "relative flex items-center gap-2 whitespace-nowrap px-3 py-2 wide:pl-4",
                  "transition-colors duration-(--dur-state) ease-(--ease)",
                  isActive ? "type-body-strong text-ink" : "type-body text-ink-2 hover:text-ink",
                )}
              >
                <span
                  aria-hidden
                  className={cn("absolute left-0 top-1 bottom-1 max-wide:hidden", isActive ? "bg-ink" : "bg-transparent")}
                  style={{ width: "2px" }}
                />
                {section.label}
                {count !== undefined && count > 0 && <MicroLabel>{count}</MicroLabel>}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** A row in a list of editable records: content plus a remove control. */
export function ListRow({
  children,
  onRemove,
  removeLabel = "Remove",
}: {
  children: ReactNode;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  return (
    <div className="flex items-start gap-3 border-t border-rule py-3 first:border-t-0 first:pt-0">
      <div className="min-w-0 grow">{children}</div>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="type-micro shrink-0 rounded-control px-2 py-1 text-ink-3 hover:bg-unsupported-tint hover:text-unsupported"
        >
          {removeLabel}
        </button>
      )}
    </div>
  );
}
