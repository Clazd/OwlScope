import "server-only";
import { createJsonStore } from "@/services/storage/json-store";
import { DIRS } from "@/services/storage/paths";
import { FeedbackSchema, type Feedback } from "./schema";

export const feedbackStore = createJsonStore<Feedback>(DIRS.feedback, FeedbackSchema, {
  fileName: (item) => item.kind === "today-rejection" ? `${item.contentId}.json` : `radar-${item.topicId}.json`,
});
