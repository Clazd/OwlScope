#!/usr/bin/env node
/**
 * Copies the woff2 files we actually use out of the @fontsource packages and
 * into /public/fonts, so the app serves its own fonts and works with no network.
 *
 * Runs on postinstall. Idempotent, and a no-op (with a warning, not an error)
 * if the fontsource packages are not installed yet.
 */
import { access, copyFile, mkdir, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, "public", "fonts");

/** Only the weights referenced by the type scale in src/app/tokens.css. */
const WANTED = [
  { pkg: "@fontsource/ibm-plex-sans", files: ["ibm-plex-sans-latin-400-normal.woff2", "ibm-plex-sans-latin-500-normal.woff2", "ibm-plex-sans-latin-600-normal.woff2"] },
  { pkg: "@fontsource/ibm-plex-mono", files: ["ibm-plex-mono-latin-400-normal.woff2", "ibm-plex-mono-latin-500-normal.woff2"] },
  { pkg: "@fontsource/newsreader", files: ["newsreader-latin-400-normal.woff2", "newsreader-latin-500-normal.woff2", "newsreader-latin-600-normal.woff2"] },
];

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await mkdir(outDir, { recursive: true });
  let copied = 0;
  let missing = 0;

  for (const { pkg, files } of WANTED) {
    const srcDir = join(root, "node_modules", ...pkg.split("/"), "files");
    if (!(await exists(srcDir))) {
      missing += files.length;
      continue;
    }
    const available = new Set(await readdir(srcDir));
    for (const file of files) {
      if (!available.has(file)) {
        missing += 1;
        continue;
      }
      const dest = join(outDir, file);
      if (await exists(dest)) continue;
      await copyFile(join(srcDir, file), dest);
      copied += 1;
    }
  }

  if (missing > 0) {
    console.warn(`[fonts] ${missing} font file(s) not found in node_modules. Run "npm install" then "npm run fonts".`);
  }
  console.log(`[fonts] ${copied} file(s) copied into public/fonts`);
}

main().catch((err) => {
  console.warn(`[fonts] skipped: ${err.message}`);
});
