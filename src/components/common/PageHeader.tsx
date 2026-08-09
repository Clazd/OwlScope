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
 * Sentence case, always. The title says what this page is, the mono subtitle
 * says what is true about it right now.
 */
export function PageHeader({ title, subtitle, action, className }: PageHeaderProps) {
  return (
    <header className={cn("border-b border-rule px-6 py-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="type-h1 text-ink">{title}</h1>
          {subtitle && (
            <p data-mono className="type-data text-ink-3 mt-1">
              {subtitle}
            </p>
          )}
        </div>
        {action && <div className="flex items-center gap-2">{action}</div>}
      </div>
    </header>
  );
}
