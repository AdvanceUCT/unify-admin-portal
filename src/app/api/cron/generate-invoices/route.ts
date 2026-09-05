/**
 * @fileoverview Handles the `/api/cron/generate-invoices` API boundary, including its authorization and request validation.
 * @module app/api/cron/generate-invoices/route
 *
 * Scheduled via vercel.json to run early each month. Vercel automatically
 * sends `Authorization: Bearer $CRON_SECRET` on cron-triggered requests when
 * that env var is set, so this route only has to check for that same value —
 * no separate secret-sharing mechanism is needed.
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
