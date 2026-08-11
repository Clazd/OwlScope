import "server-only";
import { NextResponse } from "next/server";
import { createSupabaseStore } from "@/services/storage/supabase-store";
import { createJsonStore } from "@/services/storage/json-store";
import { DIRS, DATA_ROOT } from "@/services/storage/paths";

// Schemas to initialize stores for syncing
import { PersonaSuggestionSchema } from "@/domain/evolution/schema";
import { FeedbackSchema } from "@/domain/feedback/schema";
import { MetricSchema } from "@/domain/metrics/schema";
import {
  PersonaSchema,
  FingerprintSchema,
  SampleSetSchema,
  ExperienceLogSchema,
  PersonaVersionSchema,
} from "@/domain/persona/schema";
import { SettingsSchema } from "@/domain/settings/schema";
import { TopicSchema, SourceSchema, ContentItemSchema, StudioSessionSchema } from "@/domain/studio/schema";
import { TodayRecordSchema } from "@/domain/today/schema";
import { RunSchema } from "@/services/runs/schema";

export async function POST(request: Request) {
  try {
    const { action } = await request.json();
    if (action !== "push" && action !== "pull") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "Supabase environment variables are not configured." },
        { status: 400 }
      );
    }

    // Define all the store mappings to sync
    const mappings = [
      { dir: DIRS.personaSuggestions, name: "persona-suggestions", schema: PersonaSuggestionSchema, options: { fileName: (item: any) => `${item.target.replace(/\./g, "-")}.json` } },
      { dir: DIRS.feedback, name: "feedback", schema: FeedbackSchema, options: { fileName: (item: any) => item.kind === "today-rejection" ? `${item.contentId}.json` : `radar-${item.topicId}.json` } },
      { dir: DIRS.metrics, name: "metrics", schema: MetricSchema, options: { fileName: (item: any) => `${item.contentId}.json` } },
      
      { dir: DIRS.persona, name: "persona", schema: PersonaSchema, options: { fileName: () => "persona.json" } },
      { dir: DIRS.persona, name: "fingerprint", schema: FingerprintSchema, options: { fileName: () => "fingerprint.json" } },
      { dir: DIRS.persona, name: "samples", schema: SampleSetSchema, options: { fileName: () => "samples.json" } },
      { dir: DIRS.persona, name: "experience", schema: ExperienceLogSchema, options: { fileName: () => "experience.json" } },
      { dir: DIRS.personaVersions, name: "persona-versions", schema: PersonaVersionSchema, options: {} },
      
      { dir: DATA_ROOT, name: "settings", schema: SettingsSchema, options: { fileName: () => "settings.json" } },
      
      { dir: DIRS.topics, name: "topics", schema: TopicSchema, options: { fileName: (item: any) => `topic-${item.id}.json` } },
      { dir: DIRS.sources, name: "sources", schema: SourceSchema, options: { fileName: (item: any) => `source-${item.id}.json` } },
      { dir: DIRS.content, name: "content", schema: ContentItemSchema, options: { fileName: (item: any) => `${item.id}.json` } },
      { dir: DIRS.studio, name: "studio-sessions", schema: StudioSessionSchema, options: { fileName: (item: any) => `session-${item.id}.json` } },
      
      { dir: DIRS.todayCache, name: "today-cache", schema: TodayRecordSchema, options: { fileName: (item: any) => `${item.date}.json` } },
      { dir: DIRS.runs, name: "runs", schema: RunSchema, options: { fileName: (item: any) => `run-${item.id}.json` } },
    ];

    let totalSynced = 0;

    for (const map of mappings) {
      const localStore = createJsonStore(map.dir, map.schema as any, map.options as any);
      const cloudStore = createSupabaseStore(map.name, map.schema as any);

      if (action === "push") {
        // Push: Local JSON -> Supabase
        const localItems = await localStore.list();
        for (const item of localItems) {
          await cloudStore.put(item);
          totalSynced++;
        }
      } else {
        // Pull: Supabase -> Local JSON
        const cloudItems = await cloudStore.list();
        for (const item of cloudItems) {
          await localStore.put(item);
          totalSynced++;
        }
      }
    }

    return NextResponse.json({ 
      ok: true, 
      message: `Successfully ${action === "push" ? "pushed" : "pulled"} ${totalSynced} items.` 
    });

  } catch (err) {
    return NextResponse.json(
      { error: `Cloud sync failed: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
