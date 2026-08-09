import { mkdir, rename, writeFile } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";
import { createLogger } from "@/lib/logging/log";
import { DATA_ROOT, QUARANTINE_ROOT } from "./paths";
import { enqueueWrite } from "./atomic-write";

const log = createLogger("storage/quarantine");

export interface QuarantineRecord {
  file: string;
  reason: string;
  quarantinedAt: string;
}

/**
 * A file that does not parse or does not validate is moved aside, never
 * silently dropped and never allowed to crash a page render. The reason is
 * written next to it so the user can see what was wrong and put it back.
 */
export async function quarantineFile(file: string, reason: string): Promise<QuarantineRecord> {
  const rel = relative(DATA_ROOT, file).replace(/[/\\]/g, "__");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = resolve(QUARANTINE_ROOT, `${stamp}__${rel || basename(file)}`);

  const record: QuarantineRecord = {
    file,
    reason,
    quarantinedAt: new Date().toISOString(),
  };

  await enqueueWrite(async () => {
    await mkdir(QUARANTINE_ROOT, { recursive: true });
    try {
      await rename(file, target);
    } catch (err) {
      log.error(`could not move ${file} into quarantine`, err);
      return;
    }
    await writeFile(`${target}.reason.txt`, `${reason}\n`, "utf8").catch(() => {});
  });

  log.warn(`quarantined ${file}: ${reason}`);
  return record;
}
