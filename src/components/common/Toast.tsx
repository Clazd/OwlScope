"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/format/cn";

interface ToastMessage {
  id: number;
  text: string;
  /** A failure keeps the --unsupported rule; everything else is plain ink. */
  tone: "default" | "failure";
}

interface ToastApi {
  show: (text: string, tone?: ToastMessage["tone"]) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
const DISMISS_AFTER_MS = 3000;

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside <ToastProvider>");
  return api;
}

/** Bottom-left, three seconds, ink background. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  const show = useCallback((text: string, tone: ToastMessage["tone"] = "default") => {
    setMessages((current) => [...current, { id: Date.now() + Math.random(), text, tone }]);
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 left-4 flex flex-col gap-2" style={{ zIndex: "var(--z-toast)" }}>
        {messages.map((message) => (
          <ToastItem
            key={message.id}
            message={message}
            onDone={() => setMessages((current) => current.filter((m) => m.id !== message.id))}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ message, onDone }: { message: ToastMessage; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, DISMISS_AFTER_MS);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <Toast tone={message.tone} onDismiss={onDone}>
      {message.text}
    </Toast>
  );
}

interface ToastProps {
  children: ReactNode;
  tone?: ToastMessage["tone"];
  onDismiss?: () => void;
  className?: string;
}

/** The presentational toast, exported so the gallery can render its states. */
export function Toast({ children, tone = "default", onDismiss, className }: ToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-auto flex max-w-[630px] items-start gap-3 rounded-control px-4 py-3 shadow-pop",
        "bg-ink text-bg",
        tone === "failure" && "border-l-2 border-unsupported",
        className,
      )}
    >
      <span className="type-small">{children}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="type-micro shrink-0 opacity-70 hover:opacity-100">
          Dismiss
        </button>
      )}
    </div>
  );
}
