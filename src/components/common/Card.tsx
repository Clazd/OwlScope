import type { ReactNode } from "react";
import { cn } from "@/lib/format/cn";
import { MicroLabel } from "./MicroLabel";

interface CardProps {
  children: ReactNode;
  /** Anchor target, so a run can be linked to directly. */
  id?: string;
  /** Mono label rendered above the content, inside the card. */
  label?: ReactNode;
  /** Right-aligned slot on the label row. */
  action?: ReactNode;
  padding?: "16" | "24";
  sunken?: boolean;
  /**
   * Featured cards carry a 2px accent left bar and a slightly sunken fill.
   * Use for the primary piece of information on a page.
   */
  featured?: boolean;
  className?: string;
}

/**
 * Scope Interface card.
 *
 * Always shows its border (not just on hover). Hover brightens border to
 * rule-strong for a tactile feel. Featured variant gets a 2px green left bar.
 */
export function Card({
  children,
  id,
  label,
  action,
  padding = "16",
  sunken = false,
  featured = false,
  className,
}: CardProps) {
  return (
    <section
      id={id}
      className={cn(
        "rounded-card border border-rule",
        "transition-colors duration-(--dur-state) ease-(--ease)",
        "hover:border-rule-strong",
        sunken || featured ? "bg-surface-sunken" : "bg-surface",
        padding === "24" ? "p-6" : "p-4",
        featured ? "relative overflow-hidden" : "",
        className,
      )}
    >
      {/* Featured accent bar */}
      {featured && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 3,
            background: "var(--accent)",
            borderRadius: "15px 0 0 15px",
          }}
        />
      )}
      {(label || action) && (
        <header className="mb-3 flex items-center justify-between gap-4">
          {label ? <MicroLabel>{label}</MicroLabel> : <span />}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

interface CardSectionProps {
  label?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** A division inside a card. A rule and a mono label, never another border. */
export function CardSection({ label, children, className }: CardSectionProps) {
  return (
    <div className={cn("border-t border-rule pt-3 first:border-t-0 first:pt-0", className)}>
      {label && <MicroLabel className="mb-2 block">{label}</MicroLabel>}
      {children}
    </div>
  );
}
