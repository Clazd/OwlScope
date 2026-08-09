#!/usr/bin/env node
/**
 * `git pull --rebase`, then rebuild the derived cache index.
 *
 * Conflicts are reported, never merged automatically. Syncing two machines is
 * a git problem and git already solves it; this script just remembers the two
 * commands and the rebuild that has to follow.
 */
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { requirePrivateDataSync } from "./git-data-sync-policy.mjs";

requirePrivateDataSync();

function git(args) {
  return spawnSync("git", args, { stdio: "inherit", encoding: "utf8" });
}

const pull = git(["pull", "--rebase"]);
if (pull.status !== 0) {
  const conflicts = spawnSync("git", ["diff", "--name-only", "--diff-filter=U"], { encoding: "utf8" });
  const files = (conflicts.stdout ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  if (files.length > 0) {
    console.error("\nRebase stopped on conflicting files:");
    for (const file of files) console.error(`  ${file}`);
    console.error("\nResolve them in git, then run: git rebase --continue");
  }
  process.exit(pull.status ?? 1);
}

// The index is derived, so throwing it away is always the correct repair.
rmSync(resolve(process.cwd(), "data/.cache"), { recursive: true, force: true });
console.log("Pulled. Cache index dropped; it rebuilds on next boot.");
