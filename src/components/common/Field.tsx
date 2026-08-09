"use client";

import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/format/cn";
import { MicroLabel } from "./MicroLabel";

/**
 * Form primitives. Not in the slice 1 inventory, but Settings needs inputs and
 * they belong next to the components that share their tokens rather than
 * inlined into one page.
 */

interface FieldProps {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Field({ label, hint, children, className }: FieldProps) {
  return (
    <div className={cn("py-3", className)}>
      <MicroLabel strong className="mb-2 block">
        {label}
      </MicroLabel>
      {children}
      {hint && <p className="type-small mt-2 text-ink-3">{hint}</p>}
    </div>
  );
}

type TextInputProps = InputHTMLAttributes<HTMLInputElement> & { mono?: boolean };

export function TextInput({ mono = false, className, ...rest }: TextInputProps) {
  return (
    <input
      {...rest}
      data-mono={mono ? "" : undefined}
      className={cn(
        mono ? "type-data" : "type-body",
        "w-full rounded-control border border-rule-strong bg-surface px-3 py-2 text-ink",
        "placeholder:text-ink-3 disabled:bg-surface-sunken disabled:text-ink-3",
        className,
      )}
    />
  );
}

interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: ReactNode;
  disabled?: boolean;
  disabledReason?: string;
}

/** A checkbox styled as a switch. Ink when on — never a coloured toggle. */
export function Toggle({ checked, onChange, label, description, disabled, disabledReason }: ToggleProps) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <label htmlFor={id} className="type-body-strong text-ink">
          {label}
        </label>
        {description && <p className="type-small mt-1 text-ink-3">{description}</p>}
        {disabled && disabledReason && <p className="type-small mt-1 text-ink-3">{disabledReason}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        // 48px track, 16px knob, 4px inset on both sides: every number here is
        // on the spacing scale, which is the only reason the knob lands flush.
        className={cn(
          "relative h-6 w-12 shrink-0 rounded-pill border transition-colors duration-(--dur-state) ease-(--ease)",
          checked ? "border-ink bg-ink" : "border-rule-strong bg-surface-sunken",
          disabled && "cursor-not-allowed opacity-40",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute top-1 left-1 size-4 rounded-pill transition-transform duration-(--dur-state) ease-(--ease)",
            checked ? "translate-x-6 bg-bg" : "translate-x-0 bg-ink-3",
          )}
        />
      </button>
    </div>
  );
}

interface RadioRowProps<T extends string> {
  name: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (next: T) => void;
}

/** A segmented row. Selection is ink, matching every other selected state. */
export function RadioRow<T extends string>({ name, options, value, onChange }: RadioRowProps<T>) {
  return (
    <div role="radiogroup" aria-label={name} className="inline-flex rounded-control border border-rule-strong p-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "type-small rounded-control px-3 py-1 transition-colors duration-(--dur-state) ease-(--ease)",
              active ? "bg-ink text-bg" : "text-ink-2 hover:text-ink",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
