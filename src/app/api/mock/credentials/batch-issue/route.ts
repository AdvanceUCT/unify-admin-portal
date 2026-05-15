import { corsPreflight, jsonWithCors } from "@/app/api/mock/cors";
import { queueMockBatchIssuance } from "@/lib/api/mockActivationStore";
import type { BatchIssuanceSelection } from "@/lib/api/types";

export async function POST(request: Request) {
  const selection = (await request.json().catch(() => ({}))) as BatchIssuanceSelection;
  return jsonWithCors(queueMockBatchIssuance(selection));
}

export function OPTIONS() {
  return corsPreflight();
}
