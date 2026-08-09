import "server-only";
import { createJsonStore } from "@/services/storage/json-store";
import { DIRS } from "@/services/storage/paths";
import { MetricSchema, type Metric } from "./schema";

export const metricStore = createJsonStore<Metric>(DIRS.metrics, MetricSchema, {
  fileName: (metric) => `${metric.contentId}.json`,
});
