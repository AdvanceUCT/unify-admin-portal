/**
 * @fileoverview Handles the `/api/vendor/wallet/topups/[id]` API boundary (owner-only status for the return page).
 * @module app/api/vendor/wallet/topups/[id]/route
 */

import { NextResponse } from "next/server";

import { getCurrentVendorSession } from "@/lib/auth/session";
import { walletErrorResponse } from "@/lib/payments/walletApi";
import { getApprovedVendorContextForUser } from "@/lib/vendors/context";
import { getVendorWalletTopup } from "@/lib/vendors/walletTopups";

/** Handles GET requests to `/api/vendor/wallet/topups/[id]`. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getCurrentVendorSession();
  if (!session || session.user.userType !== "VENDOR") {
    return NextResponse.json({ error: { message: "Unauthorized." } }, { status: 401 });
  }
  const vendor = await getApprovedVendorContextForUser(session.user.id);
  if (!vendor || vendor.role !== "OWNER") return NextResponse.json({ error: { message: "Forbidden." } }, { status: 403 });

  try {
    const topUp = await getVendorWalletTopup(vendor.vendorProfileId, (await context.params).id);
    return NextResponse.json(topUp, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    return walletErrorResponse(error);
  }
}
