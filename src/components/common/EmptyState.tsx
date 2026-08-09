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
 * Empty states here are invitations, not error messages: "No topics yet. Run a
 * scan, or type an idea you have been sitting on."
 */
export function EmptyState({ children, action, className }: EmptyStateProps) {
  return (
    <div className={cn("rounded-card border border-dashed border-rule px-6 py-8", className)}>
      <p className="type-body text-ink-2 reading-column">{children}</p>
      {action && <div className="mt-4 flex flex-wrap gap-2">{action}</div>}
    </div>
  );
}
