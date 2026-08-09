#!/usr/bin/env node
/**
 * Stages /data, commits with a timestamped message, and pushes.
 * Says so and stops when there is nothing to commit.
 */
import { spawnSync } from "node:child_process";

function git(args, opts = {}) {
  return spawnSync("git", args, { stdio: opts.capture ? "pipe" : "inherit", encoding: "utf8" });
}

if (git(["add", "--", "data"]).status !== 0) process.exit(1);

const staged = git(["diff", "--cached", "--name-only"], { capture: true });
if ((staged.stdout ?? "").trim() === "") {
  console.log("Nothing to push. /data is already committed.");
  process.exit(0);
}

const stamp = new Date().toISOString().replace("T", " ").slice(0, 16);
if (git(["commit", "-m", `data: sync ${stamp}`]).status !== 0) process.exit(1);
if (git(["push"]).status !== 0) process.exit(1);

console.log("Pushed /data.");
