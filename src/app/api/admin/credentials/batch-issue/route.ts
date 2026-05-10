import { type NextRequest, NextResponse } from "next/server";
import { queueBatchIssuance } from "@/lib/credentials/batchIssuance";
import type { BatchIssuanceFilters } from "@/lib/credentials/batchIssuance";

export async function POST(request: NextRequest) {
  try {
    let filters: BatchIssuanceFilters = {};

    try {
      filters = await request.json();
    } catch {
      // no body is fine — use defaults
    }

    const result = await queueBatchIssuance(filters);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Batch issuance failed." },
      { status: 500 }
    );
  }
}