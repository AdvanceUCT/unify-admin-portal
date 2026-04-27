import { corsPreflight, jsonWithCors } from "@/app/api/mock/cors";
import { queueMockBatchIssuance } from "@/lib/api/mockActivationStore";

export function POST() {
  return jsonWithCors(queueMockBatchIssuance());
}

export function OPTIONS() {
  return corsPreflight();
}
