/**
 * Boot. Runs once, in the Node runtime, before the first request is served.
 *
 * Everything Node-specific is imported dynamically behind the runtime check, so
 * nothing here ends up in an edge bundle.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const [{ createLogger }, { assertLocalhost }, { rebuildIndex }] = await Promise.all([
    import("@/lib/logging/log"),
    import("@/lib/boot/localhost"),
    import("@/services/storage/index-cache"),
  ]);

  const log = createLogger("boot");
  assertLocalhost(log);

  // The derived index is rebuilt from the source files on every boot. It is
  // never the source of truth, so throwing it away and recomputing is always
  // the correct repair.
  try {
    const index = await rebuildIndex();
    log.info(`data ready: ${index.totalFiles} files`);
  } catch (err) {
    log.error("could not build the cache index; the app will read source files directly", err);
  }
}
