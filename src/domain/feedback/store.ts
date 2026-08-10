import "server-only";
import { createDataStore } from "@/services/storage/store-factory";
import { DIRS } from "@/services/storage/paths";
import { FeedbackSchema, type Feedback } from "./schema";

export const feedbackStore = createDataStore<Feedback>(DIRS.feedback, "feedback", FeedbackSchema, {
  fileName: (item) => item.kind === "today-rejection" ? `${item.contentId}.json` : `radar-${item.topicId}.json`,
});
