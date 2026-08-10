"use client";

import { useEffect } from "react";

/**
 * Global error boundary. Catches unhandled errors in any route and shows a
 * branded recovery screen instead of the raw Next.js error page.
 *
 * This is a client component because error boundaries must run in the browser.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Grounded Voice] Unhandled error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center px-6 py-12">
      <div className="reading-column space-y-6 text-center">
        <p className="type-micro text-ink-3">Something went wrong</p>
        <h1 className="type-h1 text-ink">
          An unexpected error occurred
        </h1>
        <p className="type-body text-ink-2">
          The page could not be rendered. This is a bug, not a content decision.
          Your data is safe on disk.
        </p>
        {error.digest && (
          <p data-mono className="type-data text-ink-3">
            Error digest: {error.digest}
          </p>
        )}
        <div className="flex justify-center gap-3 pt-4">
          <button
            type="button"
            onClick={reset}
            className="rounded-control border border-rule-strong bg-surface px-4 py-2 type-body-strong text-ink transition-colors hover:bg-surface-sunken"
            style={{ transitionDuration: "var(--dur-state)" }}
          >
            Try again
          </button>
          <a
            href="/today"
            className="rounded-control border border-rule px-4 py-2 type-body text-ink-2 transition-colors hover:text-ink hover:bg-surface-sunken"
            style={{ transitionDuration: "var(--dur-state)" }}
          >
            Go to Today
          </a>
        </div>
      </div>
    </div>
  );
}
