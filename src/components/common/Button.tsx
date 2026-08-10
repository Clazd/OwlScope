"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/format/cn";

type Variant = "primary" | "secondary" | "quiet" | "destructive";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

/**
 * Buttons are ink. There are no coloured buttons in this product — colour means
 * epistemic status and nothing else.
 *
 * Destructive actions are --unsupported as *text only*, never a filled red
 * button, because a filled red button reads as "status: unsupported" to a user
 * who has learned the four colours.
 */
const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-ink text-bg border border-ink hover:opacity-90 hover:shadow-pop active:scale-[0.98]",
  secondary:
    "bg-surface text-ink border border-rule-strong hover:bg-surface-sunken hover:border-ink-3 active:scale-[0.98]",
  quiet:
    "bg-transparent text-ink-2 border border-transparent hover:bg-surface-sunken hover:text-ink active:scale-[0.98]",
  destructive:
    "bg-transparent text-unsupported border border-rule-strong hover:bg-unsupported-tint active:scale-[0.98]",
};

export function Button({ variant = "secondary", className, children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        "type-body-strong inline-flex items-center justify-center gap-2 rounded-control px-4 py-2",
        "transition-[background-color,opacity,color,box-shadow,transform] duration-(--dur-state) ease-(--ease)",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100",
        VARIANTS[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}
