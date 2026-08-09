import { NextResponse } from "next/server";
import { getBudgetStatus } from "@/domain/budget/budget";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getBudgetStatus());
}
