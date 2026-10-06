/**
 * @fileoverview CRON_SECRET-protected daily job: overdraft monitor, then the threshold payout sweep.
 * @module app/api/cron/vendor-wallet-payouts/route
 */

import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { env } from "@/lib/config/env";
import { runOverdraftMonitor } from "@/lib/vendors/overdraft";
import { runVendorWalletPayouts } from "@/lib/vendors/payouts";

function authorized(request: Request, secret: string) {
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function GET(request: Request) {
  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: { message: "CRON_SECRET is not configured." } }, { status: 500 });
  }
  if (!authorized(request, env.CRON_SECRET)) {
    return NextResponse.json({ error: { message: "Unauthorized." } }, { status: 401 });
  }

  try {
    const overdraft = await runOverdraftMonitor();
    const payouts = await runVendorWalletPayouts();
    return NextResponse.json({ overdraft, payouts });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          message: error instanceof Error ? error.message : "Vendor wallet payout run failed.",
        },
      },
      { status: 500 },
    );
  }
}
