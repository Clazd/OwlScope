import "server-only";
import { createDataStore } from "@/services/storage/store-factory";
import { DIRS } from "@/services/storage/paths";
import { MetricSchema, type Metric } from "./schema";

export const metricStore = createDataStore<Metric>(DIRS.metrics, "metrics", MetricSchema, {
  fileName: (metric) => `${metric.contentId}.json`,
});
