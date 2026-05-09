import { NextResponse } from "next/server";
import { queueBatchIssuance } from "@/lib/credentials/batchIssuance";

export async function POST() {
  try {
    const result = await queueBatchIssuance();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Batch issuance failed." },
      { status: 500 }
    );
  }
}