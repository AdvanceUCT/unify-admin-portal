import { NextResponse } from "next/server";
import { queueMockBatchIssuance } from "@/lib/api/mockActivationStore";

export function POST() {
  return NextResponse.json(queueMockBatchIssuance());
}
