import type { Logger } from "@/lib/logging/log";

const LOCAL_HOSTS = new Set(["127.0.0.1", "::1", "localhost", ""]);

/**
 * There is no login screen, no session and no passcode, because the app is only
 * ever meant to be reachable from this machine. If that assumption is broken,
 * say so loudly rather than quietly serving the user's data to a LAN.
 *
 * This lives in its own module, imported dynamically from `instrumentation.ts`,
 * so `process.argv` never reaches an edge bundle.
 */
export function assertLocalhost(log: Logger): boolean {
  // When Supabase auth is configured the app is protected by login, so
  // binding to 0.0.0.0 is intentional and safe.
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return true;
  }

  const argv = process.argv;
  const flagIndex = argv.findIndex((arg) => arg === "-H" || arg === "--hostname");
  const fromFlag = flagIndex >= 0 ? argv[flagIndex + 1] : undefined;
  const fromInline = argv.find((arg) => arg.startsWith("--hostname="))?.split("=")[1];
  const host = fromFlag ?? fromInline ?? process.env.HOSTNAME ?? "";

  if (LOCAL_HOSTS.has(host)) return true;

  const banner = "=".repeat(72);
  log.warn(banner);
  log.warn(`This app is bound to ${host}, not localhost.`);
  log.warn("There is no authentication of any kind. Anyone who can reach this");
  log.warn("host can read and edit your persona, drafts and settings.");
  log.warn("Restart with: npm run dev   (which binds to 127.0.0.1)");
  log.warn(banner);
  return false;
}
