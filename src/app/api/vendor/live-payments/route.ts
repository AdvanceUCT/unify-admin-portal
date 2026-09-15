/**
 * @fileoverview Handles the `/api/vendor/live-payments` API boundary.
 * @module app/api/vendor/live-payments/route
 */

import { NextResponse } from "next/server";

import { getCurrentVendorSession } from "@/lib/auth/session";
import { listActivePaymentBranchIdsForContext } from "@/lib/payments/branchOnboarding";
import { getLivePaymentEvents } from "@/lib/vendors/livePayments";
import { getApprovedVendorContextForUser } from "@/lib/vendors/context";

/** Handles GET requests to `/api/vendor/live-payments`. */
export async function GET(request: Request) {
  const session = await getCurrentVendorSession();
  if (!session || session.user.userType !== "VENDOR") {
    return NextResponse.json({ error: { message: "Unauthorized." } }, { status: 401 });
  }

  const context = await getApprovedVendorContextForUser(session.user.id);
  if (!context) return NextResponse.json({ error: { message: "Forbidden." } }, { status: 403 });
  const paymentBranchIds = await listActivePaymentBranchIdsForContext(context);
  if (paymentBranchIds.length === 0) {
    return NextResponse.json({ error: { message: "Payment approval has not been granted." } }, { status: 403 });
  }
  const paymentContext = { ...context, branchIds: paymentBranchIds };

  try {
    const searchParams = new URL(request.url).searchParams;
    const branchIds = searchParams.getAll("branchId").filter(Boolean);
    if (branchIds.some((branchId) => !paymentBranchIds.includes(branchId))) {
      return NextResponse.json({ error: { message: "Forbidden." } }, { status: 403 });
    }

    const result = await getLivePaymentEvents(
      paymentContext,
      searchParams.get("cursor") ?? undefined,
      branchIds.length > 0 ? { branchIds } : {},
    );

    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : "Unable to load live payments." } },
      { status: 400, headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  }
}
