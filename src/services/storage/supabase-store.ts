import "server-only";
import type { ZodType } from "zod";
import { createLogger } from "@/lib/logging/log";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { Entity, Store } from "./json-store";

const log = createLogger("storage/supabase-store");

const TABLE = "json_documents";

export function createSupabaseStore<T extends Entity>(
  storeName: string,
  schema: ZodType<T>,
): Store<T> {
  function admin() {
    return createSupabaseAdminClient();
  }

  return {
    async get(id) {
      const { data, error } = await admin()
        .from(TABLE)
        .select("data")
        .eq("store", storeName)
        .eq("id", id)
        .maybeSingle();

      if (error) {
        log.warn(`supabase get error (${storeName}/${id}): ${error.message}`);
        return null;
      }
      if (!data) return null;

      const result = schema.safeParse(data.data);
      if (!result.success) {
        log.warn(`schema validation failed for ${storeName}/${id}: ${result.error.message}`);
        return null;
      }
      return result.data;
    },

    async list(filter?) {
      const { data, error } = await admin()
        .from(TABLE)
        .select("data")
        .eq("store", storeName)
        .order("updated_at", { ascending: true });

      if (error) {
        log.warn(`supabase list error (${storeName}): ${error.message}`);
        return [];
      }

      const items: T[] = [];
      for (const row of data ?? []) {
        const result = schema.safeParse(row.data);
        if (!result.success) {
          log.warn(`skipping invalid ${storeName} row: ${result.error.message}`);
          continue;
        }
        if (filter && !matchesFilter(result.data, filter)) continue;
        items.push(result.data);
      }
      return items;
    },

    async put(item) {
      const validated = schema.parse(item);
      const { error } = await admin()
        .from(TABLE)
        .upsert(
          {
            store: storeName,
            id: validated.id,
            data: validated,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "store,id" },
        );

      if (error) {
        throw new Error(`supabase put error (${storeName}/${validated.id}): ${error.message}`);
      }
      return validated;
    },

    async patch(id, changes) {
      const current = await this.get(id);
      if (!current) throw new Error(`No item with id ${id} in store ${storeName}`);
      const next = { ...current, ...changes, id: current.id };
      return this.put(next);
    },

    async remove(id) {
      const { error } = await admin()
        .from(TABLE)
        .delete()
        .eq("store", storeName)
        .eq("id", id);

      if (error) {
        log.warn(`supabase remove error (${storeName}/${id}): ${error.message}`);
      }
    },
  };
}

function matchesFilter<T extends Entity>(item: T, filter: Partial<T>): boolean {
  for (const [key, expected] of Object.entries(filter)) {
    if (expected === undefined) continue;
    if (item[key as keyof T] !== expected) return false;
  }
  return true;
}
