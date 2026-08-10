/**
 * Server-side logging. Deliberately tiny: no transport, no error service, no
 * paid anything. Structured enough to grep, quiet enough to leave on.
 */

type Level = "debug" | "info" | "warn" | "error";

const PREFIX = "[studio]";

const ORDER: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };

/**
 * `LOG_LEVEL` raises the floor. Unset behaves exactly as before - everything in
 * development, everything but debug in production - so this only exists for the
 * one caller that genuinely wants quiet: a test run, where a hundred debug
 * lines bury the assertion that failed.
 */
function floor(): number {
  const configured = process.env.LOG_LEVEL?.toLowerCase() as Level | undefined;
  if (configured && configured in ORDER) return ORDER[configured];
  return process.env.NODE_ENV === "production" ? ORDER.info : ORDER.debug;
}

function emit(level: Level, scope: string, message: string, extra?: unknown) {
  if (ORDER[level] < floor()) return;
  const line = `${PREFIX} ${level.toUpperCase()} ${scope}: ${message}`;
  // eslint-disable-next-line no-console -- the logging module is the one place console.log is correct
  const write = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  if (extra === undefined) write(line);
  else write(line, extra);
}

export function createLogger(scope: string) {
  return {
    debug: (message: string, extra?: unknown) => emit("debug", scope, message, extra),
    info: (message: string, extra?: unknown) => emit("info", scope, message, extra),
    warn: (message: string, extra?: unknown) => emit("warn", scope, message, extra),
    error: (message: string, extra?: unknown) => emit("error", scope, message, extra),
  };
}

export type Logger = ReturnType<typeof createLogger>;
