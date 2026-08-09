import { NextResponse } from "next/server";
import { testRadarProviders } from "@/domain/radar/scan";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    return NextResponse.json(await testRadarProviders());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
