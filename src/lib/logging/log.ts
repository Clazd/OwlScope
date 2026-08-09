/**
 * Server-side logging. Deliberately tiny: no transport, no error service, no
 * paid anything. Structured enough to grep, quiet enough to leave on.
 */

type Level = "debug" | "info" | "warn" | "error";

const PREFIX = "[studio]";

function emit(level: Level, scope: string, message: string, extra?: unknown) {
  const line = `${PREFIX} ${level.toUpperCase()} ${scope}: ${message}`;
  const write = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  if (extra === undefined) write(line);
  else write(line, extra);
}

export function createLogger(scope: string) {
  return {
    debug: (message: string, extra?: unknown) => {
      if (process.env.NODE_ENV !== "production") emit("debug", scope, message, extra);
    },
    info: (message: string, extra?: unknown) => emit("info", scope, message, extra),
    warn: (message: string, extra?: unknown) => emit("warn", scope, message, extra),
    error: (message: string, extra?: unknown) => emit("error", scope, message, extra),
  };
}

export type Logger = ReturnType<typeof createLogger>;
