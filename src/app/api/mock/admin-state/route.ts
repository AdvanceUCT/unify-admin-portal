/**
 * @fileoverview Handles the `/api/mock/admin-state` API boundary, including its authorization and request validation.
 * @module app/api/mock/admin-state/route
 */

import { corsPreflight, jsonWithCors } from "@/app/api/mock/cors";
import { getMockAdminState } from "@/lib/api/mockActivationStore";

export const dynamic = "force-dynamic";

export function GET() {
  return jsonWithCors(getMockAdminState());
}

export function OPTIONS() {
  return corsPreflight();
}
