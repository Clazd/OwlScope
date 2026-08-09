"use client";

import { useId } from "react";
import { cn } from "@/lib/format/cn";

interface SliderRowProps {
  /** What the dimension is, e.g. "Register". */
  name: string;
  /** The two ends, both named. "Plain" ←→ "Technical". */
  lowLabel: string;
  highLabel: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}

/**
 * A bipolar slider with both poles labelled in mono.
 *
 * Both poles are named because an unlabelled slider asks the user to guess
 * which direction is "more", and voice has no "more" — it has ends.
 */
export function SliderRow({
  name,
  lowLabel,
  highLabel,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  className,
}: SliderRowProps) {
  const id = useId();
  return (
    <div className={cn("py-3", className)}>
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <label htmlFor={id} className="type-body-strong text-ink">
          {name}
        </label>
        <span data-mono className="type-data text-ink-3">
          {value}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="accent-ink w-full"
      />
      <div className="mt-1 flex justify-between">
        <span data-mono className="type-micro text-ink-3">
          {lowLabel}
        </span>
        <span data-mono className="type-micro text-ink-3">
          {highLabel}
        </span>
      </div>
    </div>
  );
}
