/**
 * @fileoverview Handles the `/api/vendor/wallet/topups/[id]/reconcile` API boundary.
 * @module app/api/vendor/wallet/topups/[id]/reconcile/route
 */

import { NextResponse } from "next/server";

import { getCurrentVendorSession } from "@/lib/auth/session";
import { isRateLimited, isSameOriginRequest } from "@/lib/billing/paymentRouteGuards";
import { walletErrorResponse } from "@/lib/payments/walletApi";
import { getApprovedVendorContextForUser } from "@/lib/vendors/context";
import { reconcileVendorWalletTopup } from "@/lib/vendors/walletTopups";

/**
 * Handles POST requests to `/api/vendor/wallet/topups/[id]/reconcile`. Owner only and same-origin.
 * Verifies the stored attempt with Paystack; no caller-supplied payment outcome is trusted.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getCurrentVendorSession();
  if (!session || session.user.userType !== "VENDOR") {
    return NextResponse.json({ error: { message: "Unauthorized." } }, { status: 401 });
  }
  const vendor = await getApprovedVendorContextForUser(session.user.id);
  if (!vendor || vendor.role !== "OWNER") return NextResponse.json({ error: { message: "Forbidden." } }, { status: 403 });
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: { message: "Cross-origin requests are not allowed." } }, { status: 403 });
  }

  const { id } = await context.params;
  if (isRateLimited(`vendor-topup-reconcile:${vendor.vendorProfileId}:${id}`)) {
    return NextResponse.json({ error: { message: "Too many requests. Please wait a moment and try again." } }, { status: 429 });
  }

  try {
    const topUp = await reconcileVendorWalletTopup({ vendorProfileId: vendor.vendorProfileId, topUpId: id });
    return NextResponse.json(topUp, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    return walletErrorResponse(error);
  }
}
