import { NextResponse } from "next/server";
import { getBatchHistory } from "@/lib/db/store";

export async function GET() {
  const batches = await getBatchHistory();
  return NextResponse.json(batches);
}