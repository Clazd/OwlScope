import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/format/cn";

interface MicroLabelProps {
  children: ReactNode;
  as?: ElementType;
  className?: string;
  /** Use --ink-2 instead of --ink-3 when the label carries real weight. */
  strong?: boolean;
}

/**
 * Mono, uppercase, 11px. The workhorse of the interface: anything that names a
 * field, a section, or a measurement is one of these.
 */
export function MicroLabel({ children, as: Tag = "span", className, strong = false }: MicroLabelProps) {
  return (
    <Tag data-mono className={cn("type-micro", strong ? "text-ink-2" : "text-ink-3", className)}>
      {children}
    </Tag>
  );
}
