import type { ZodType } from "zod";
import type { Entity, Store, JsonStoreOptions } from "./json-store";
import { createJsonStore } from "./json-store";

/**
 * Returns a Supabase-backed store when NEXT_PUBLIC_SUPABASE_URL is set,
 * otherwise falls back to the filesystem JSON store.
 *
 * The `storeName` is used as the partition key in the Supabase table.
 * When running locally without Supabase, the `dir` parameter is passed
 * through to `createJsonStore` exactly as before.
 */
export function createDataStore<T extends Entity>(
  dir: string,
  storeName: string,
  schema: ZodType<T>,
  options?: JsonStoreOptions<T>,
): Store<T> {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createSupabaseStore } = require("./supabase-store") as typeof import("./supabase-store");
    return createSupabaseStore<T>(storeName, schema);
  }
  return createJsonStore<T>(dir, schema, options);
}
