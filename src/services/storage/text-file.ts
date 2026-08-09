import "server-only";
import { readFile } from "node:fs/promises";
import { assertInsideData } from "./paths";

/** Read-only escape hatch for derived cache/export files; source entities use createJsonStore. */
export async function readDataText(file: string): Promise<string> {
  assertInsideData(file);
  return readFile(file, "utf8");
}
