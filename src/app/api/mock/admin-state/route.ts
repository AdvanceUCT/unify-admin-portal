import { corsPreflight, jsonWithCors } from "@/app/api/mock/cors";
import { getMockAdminState } from "@/lib/api/mockActivationStore";

export const dynamic = "force-dynamic";

export function GET() {
  return jsonWithCors(getMockAdminState());
}

export function OPTIONS() {
  return corsPreflight();
}
