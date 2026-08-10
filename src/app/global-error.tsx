"use client";

/**
 * Root-level error boundary. This only fires when the root layout itself
 * throws, which means we cannot rely on any of the usual shell, tokens or
 * fonts. The inline styles are intentional.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif',
          background: "#0A0C10",
          color: "#E8E9EB",
          colorScheme: "dark",
        }}
      >
        <div style={{ maxWidth: 720, padding: 24, textAlign: "center" }}>
          <p
            style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: "0.6875rem",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#5C6370",
              marginBottom: 16,
            }}
          >
            Critical error
          </p>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: 12 }}>
            OwlScope could not start
          </h1>
          <p style={{ fontSize: "0.9375rem", color: "#8B919A", marginBottom: 24 }}>
            The root layout failed to render. Your data is safe on disk.
          </p>
          {error.digest && (
            <p
              style={{
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: "0.8125rem",
                color: "#5C6370",
                marginBottom: 24,
              }}
            >
              Digest: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              padding: "8px 16px",
              border: "1px solid #2C3038",
              borderRadius: 6,
              background: "#12151A",
              cursor: "pointer",
              fontSize: "0.9375rem",
              fontWeight: 500,
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
