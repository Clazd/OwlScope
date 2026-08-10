import type { ReactNode } from "react";
import { cn } from "@/lib/format/cn";

interface EmptyStateProps {
  /** One sentence of direction. Not a headline, not an apology. */
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}

/**
 * No icon. No illustration. One sentence of direction plus one action.
 *
 * Empty states are invitations, not error messages.
 */
export function EmptyState({ children, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "rounded-card border border-dashed border-rule-strong bg-surface-sunken px-6 py-8",
        "transition-colors duration-(--dur-state) hover:border-rule-strong",
        className,
      )}
    >
      <p className="type-body text-ink-2 reading-column">{children}</p>
      {action && <div className="mt-4 flex flex-wrap gap-2">{action}</div>}
    </div>
  );
}
