import type { ReactNode } from "react";
import { cn } from "@/lib/format/cn";

/**
 * The content region under a PageHeader. Constrained to the reading column by
 * default; pass `wide` for tables, which are the only thing allowed full width.
 */
export function PageBody({
  children,
  wide = false,
  className,
}: {
  children: ReactNode;
  wide?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("px-6 py-6", className)}>
      <div className={cn(wide ? "w-full" : "reading-column", "space-y-4")}>{children}</div>
    </div>
  );
}
