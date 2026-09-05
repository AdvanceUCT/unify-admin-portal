/**
 * @fileoverview Handles the `/api/cron/generate-invoices` API boundary, including its authorization and request validation.
 * @module app/api/cron/generate-invoices/route
 *
 * Scheduled via vercel.json to run shortly after each month ends — the
 * period can only be counted completely once every verification in it has
 * happened, so this fires just after midnight on the 1st rather than in the
 * last hours of the 30th/31st. Vercel automatically sends
 * `Authorization: Bearer $CRON_SECRET` on cron-triggered requests when that
 * env var is set, so this route only has to check for that same value — no
 * separate secret-sharing mechanism is needed.
 *
 * This is the automatic path; the billing page's Refresh button triggers the
 * exact same underlying function on demand.
 */

import { NextResponse } from "next/server";

import { generateMonthlyInvoicesForVendors } from "@/lib/billing/invoiceService";
import { env } from "@/lib/config/env";

/** Handles GET requests to `/api/cron/generate-invoices`. */
export async function GET(request: Request) {
  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await generateMonthlyInvoicesForVendors();
  return NextResponse.json(result);
}
