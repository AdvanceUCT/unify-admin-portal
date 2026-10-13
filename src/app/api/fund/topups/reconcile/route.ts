/**
 * @fileoverview Handles the public `/api/fund/topups/reconcile` API boundary.
 * @module app/api/fund/topups/reconcile/route
 */

import { handleFunderTopupRequest } from "@/lib/payments/funderApi";
import { reconcileFunderTopup } from "@/lib/payments/topups";

/**
 * Handles POST requests to `/api/fund/topups/reconcile`. Verifies the funder's
 * attempt with Paystack; no caller-supplied payment outcome is trusted.
 */
export async function POST(request: Request) {
  return handleFunderTopupRequest(request, "fund-topup-reconcile", reconcileFunderTopup);
}
