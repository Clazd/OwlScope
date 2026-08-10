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
  className?: string;
}

/**
 * A 1px rule and a 10px radius. Cards are defined by borders, never shadows.
 * Hover subtly brightens the border for a premium tactile feel.
 */
export function Card({ children, id, label, action, padding = "16", sunken = false, className }: CardProps) {
  return (
    <section
      id={id}
      className={cn(
        "rounded-card border border-rule",
        "transition-colors duration-(--dur-state) ease-(--ease)",
        "hover:border-rule-strong",
        sunken ? "bg-surface-sunken" : "bg-surface",
        padding === "24" ? "p-6" : "p-4",
        className,
      )}
    >
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
