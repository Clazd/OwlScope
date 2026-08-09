import "server-only";
import { createJsonStore } from "@/services/storage/json-store";
import { DIRS } from "@/services/storage/paths";
import { TodayRecordSchema, type TodayRecord } from "./schema";

export const todayStore = createJsonStore<TodayRecord>(DIRS.todayCache, TodayRecordSchema, {
  fileName: (record) => `${record.date}.json`,
});
