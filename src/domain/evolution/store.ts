import "server-only";
import { createDataStore } from "@/services/storage/store-factory";
import { DIRS } from "@/services/storage/paths";
import { PersonaSuggestionSchema, type PersonaSuggestion } from "./schema";

export const suggestionStore = createDataStore<PersonaSuggestion>(DIRS.personaSuggestions, "persona-suggestions", PersonaSuggestionSchema, {
  fileName: (suggestion) => `${suggestion.target.replace(/\./g, "-")}.json`,
});
