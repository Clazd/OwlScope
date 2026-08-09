import "server-only";
import { createJsonStore } from "@/services/storage/json-store";
import { DIRS } from "@/services/storage/paths";
import { PersonaSuggestionSchema, type PersonaSuggestion } from "./schema";

export const suggestionStore = createJsonStore<PersonaSuggestion>(DIRS.personaSuggestions, PersonaSuggestionSchema, {
  fileName: (suggestion) => `${suggestion.target.replace(/\./g, "-")}.json`,
});
