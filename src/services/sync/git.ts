import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createLogger } from "@/lib/logging/log";
import { patchSettings, readSettings } from "@/domain/settings/store";
import { rebuildIndex } from "@/services/storage/index-cache";

const run = promisify(execFile);
const log = createLogger("sync");

const GIT_TIMEOUT_MS = 60_000;

export interface SyncResult {
  ok: boolean;
  /** What to show the user. Already phrased for the interface. */
  message: string;
  /** Files git could not merge. Non-empty means: resolve this in git yourself. */
  conflicts: string[];
  output: string;
}

export function describeSyncFailure(output: string, conflicts: readonly string[]): Pick<SyncResult, "message" | "conflicts"> {
  if (conflicts.length > 0) {
    return {
      message: `Rebase stopped on ${conflicts.length} conflicting file(s): ${conflicts.join(", ")}. Resolve them in git, then run pull again.`,
      conflicts: [...conflicts],
    };
  }
  return { message: `Pull failed. ${firstLine(output)}`, conflicts: [] };
}

async function git(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await run("git", args, {
      cwd: process.cwd(),
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: 4 * 1024 * 1024,
    });
    return { stdout, stderr, code: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number; message: string };
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? e.message, code: typeof e.code === "number" ? e.code : 1 };
  }
}

/** Paths git reports as unmerged. Empty unless a rebase actually conflicted. */
async function conflictingPaths(): Promise<string[]> {
  const { stdout } = await git(["diff", "--name-only", "--diff-filter=U"]);
  return stdout.split("\n").map((line) => line.trim()).filter(Boolean);
}

/**
 * `git pull --rebase`, then rebuild the derived index because the source files
 * on disk have just changed underneath it.
 *
 * Conflicts are reported, never merged automatically. Two machines editing the
 * same persona is a decision the user has to make, and a tool that guesses at
 * it is worse than one that stops.
 */
export async function syncPull(): Promise<SyncResult> {
  const result = await git(["pull", "--rebase"]);
  const output = `${result.stdout}${result.stderr}`.trim();

  if (result.code !== 0) {
    const conflicts = await conflictingPaths();
    return { ok: false, ...describeSyncFailure(output, conflicts), output };
  }

  await rebuildIndex();
  await patchSettings({ sync: { ...(await readSettings()).sync, lastPullAt: new Date().toISOString() } });
  log.info("pulled and rebuilt the index");
  return { ok: true, message: "Pulled and rebuilt the index.", conflicts: [], output };
}

/** Stages /data, commits with a timestamped message, pushes. */
export async function syncPush(): Promise<SyncResult> {
  const staged = await git(["add", "--", "data"]);
  if (staged.code !== 0) {
    return { ok: false, message: `Could not stage /data. ${firstLine(staged.stderr)}`, conflicts: [], output: staged.stderr };
  }

  const pending = await git(["diff", "--cached", "--name-only"]);
  if (pending.stdout.trim() === "") {
    return { ok: true, message: "Nothing to push. /data is already committed.", conflicts: [], output: "" };
  }

  const stamp = new Date().toISOString().replace("T", " ").slice(0, 16);
  const commit = await git(["commit", "-m", `data: sync ${stamp}`]);
  if (commit.code !== 0) {
    return { ok: false, message: `Commit failed. ${firstLine(commit.stderr)}`, conflicts: [], output: commit.stderr };
  }

  const pushed = await git(["push"]);
  const output = `${commit.stdout}${pushed.stdout}${pushed.stderr}`.trim();
  if (pushed.code !== 0) {
    return {
      ok: false,
      message: `Committed, but the push failed. ${firstLine(pushed.stderr)}`,
      conflicts: [],
      output,
    };
  }

  await patchSettings({ sync: { ...(await readSettings()).sync, lastPushAt: new Date().toISOString() } });
  log.info("committed and pushed /data");
  return { ok: true, message: "Committed and pushed /data.", conflicts: [], output };
}

function firstLine(text: string): string {
  return text.trim().split("\n")[0] ?? "";
}
