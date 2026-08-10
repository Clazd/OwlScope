import "server-only";
import { createDataStore } from "@/services/storage/store-factory";
import { DIRS } from "@/services/storage/paths";
import { TodayRecordSchema, type TodayRecord } from "./schema";

export const todayStore = createDataStore<TodayRecord>(DIRS.todayCache, "today-cache", TodayRecordSchema, {
  fileName: (record) => `${record.date}.json`,
});
