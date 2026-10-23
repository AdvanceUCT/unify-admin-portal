/**
 * @fileoverview Handles the `/api/vendor/wallet/overview` API boundary used to live-update the payments page wallet card.
 * @module app/api/vendor/wallet/overview/route
 */

import { NextResponse } from "next/server";

import { toVendorWalletOverview } from "@/app/vendor/(portal)/payments/walletOverview";
import { getCurrentVendorSession } from "@/lib/auth/session";
import { getApprovedVendorContextForUser } from "@/lib/vendors/context";
import { getVendorPayoutOverview } from "@/lib/vendors/payouts";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

/** Handles GET requests to `/api/vendor/wallet/overview`. */
export async function GET() {
  const session = await getCurrentVendorSession();
  if (!session || session.user.userType !== "VENDOR") {
    return NextResponse.json({ error: { message: "Unauthorized." } }, { status: 401, headers: NO_STORE });
  }

  const context = await getApprovedVendorContextForUser(session.user.id);
  if (!context) return NextResponse.json({ error: { message: "Forbidden." } }, { status: 403, headers: NO_STORE });

  try {
    const overview = toVendorWalletOverview(await getVendorPayoutOverview(context));
    return NextResponse.json(overview, { headers: NO_STORE });
  } catch {
    return NextResponse.json(
      { error: { message: "Unable to load the wallet balance." } },
      { status: 500, headers: NO_STORE },
    );
  }
}
