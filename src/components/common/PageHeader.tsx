import type { ReactNode } from "react";
import { cn } from "@/lib/format/cn";

interface PageHeaderProps {
  title: string;
  /** Mono line under the title: a date, a count, a state. */
  subtitle?: ReactNode;
  /** Right-aligned actions. */
  action?: ReactNode;
  className?: string;
}

/**
 * Scope Interface page header.
 *
 * Full-bleed surface band with a 1px bottom rule — gives every page a defined
 * header zone rather than text floating on darkness. A 2px accent bar on the
 * left of the title anchors the green to the content hierarchy.
 */
export function PageHeader({ title, subtitle, action, className }: PageHeaderProps) {
  return (
    <header
      className={cn("border-b border-rule px-6 py-8 bg-surface", className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {/* Green left accent bar */}
          <div
            aria-hidden
            style={{
              width: 2,
              alignSelf: "stretch",
              minHeight: 24,
              background: "var(--accent)",
              borderRadius: 2,
              flexShrink: 0,
              marginTop: 3,
            }}
          />
          <div>
            <h1 className="type-h1 text-ink">{title}</h1>
            {subtitle && (
              <p data-mono className="type-data text-ink-2 mt-2">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {action && <div className="flex items-center gap-2">{action}</div>}
      </div>
    </header>
  );
}
