import { NextResponse } from "next/server";
import { exportMemory, type MemoryExportFormat } from "@/domain/memory/export";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const format = new URL(request.url).searchParams.get("format") as MemoryExportFormat | null;
  if (format !== "json" && format !== "markdown") {
    return NextResponse.json({ error: "Choose format=json or format=markdown." }, { status: 400 });
  }
  const result = await exportMemory(format);
  return new Response(result.body, {
    headers: {
      "content-type": result.contentType,
      "content-disposition": `attachment; filename="${result.name}"`,
    },
  });
}
