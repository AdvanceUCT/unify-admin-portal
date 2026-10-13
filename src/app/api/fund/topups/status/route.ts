/**
 * @fileoverview Handles the public `/api/fund/topups/status` API boundary.
 * @module app/api/fund/topups/status/route
 */

import { handleFunderTopupRequest } from "@/lib/payments/funderApi";
import { getFunderTopup } from "@/lib/payments/topups";

/**
 * Handles POST requests to `/api/fund/topups/status`. No session: the
 * `topUpId` + `reference` pair is the capability. POST keeps the reference
 * out of access logs.
 */
export async function POST(request: Request) {
  return handleFunderTopupRequest(request, "fund-topup-status", getFunderTopup);
}
