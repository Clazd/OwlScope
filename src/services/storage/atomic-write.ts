import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { assertInsideData } from "./paths";

/**
 * A single in-process write queue serialises every write in the app. That is
 * the whole concurrency story — no file locking, no advisory locks, no lockfile
 * cleanup after a crash. It works because there is exactly one process.
 */
let tail: Promise<unknown> = Promise.resolve();

export function enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
  const run = tail.then(task, task);
  // Keep the chain alive even when a caller's task rejects.
  tail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Drains the queue. Tests use this; nothing in the app needs to. */
export function writeQueueIdle(): Promise<void> {
  return tail.then(
    () => undefined,
    () => undefined,
  );
}

/**
 * Write to `<file>.tmp`, then rename over the target. rename() is atomic within
 * a filesystem, so a reader either sees the whole old file or the whole new
 * one, never a half-written document — including when the power goes out.
 */
export async function atomicWriteText(file: string, contents: string): Promise<void> {
  assertInsideData(file);
  return enqueueWrite(async () => {
    const tmp = `${file}.tmp`;
    await mkdir(dirname(file), { recursive: true });
    try {
      await writeFile(tmp, contents, "utf8");
      await rename(tmp, file);
    } catch (err) {
      await rm(tmp, { force: true }).catch(() => {});
      throw err;
    }
  });
}

export async function atomicWriteJson(file: string, value: unknown): Promise<void> {
  return atomicWriteText(file, `${JSON.stringify(value, null, 2)}\n`);
}
