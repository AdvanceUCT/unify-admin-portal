/**
 * @fileoverview Server actions for `/vendor/test-tools` — self-service demo data, scoped to the signed-in vendor only.
 * @module app/vendor/(portal)/test-tools/actions
 */

"use server";

import { revalidatePath } from "next/cache";

import { runVerificationBillingBackfill } from "@/lib/billing/backfill";
import { INVOICE_CLOSING_DELAY_SECONDS } from "@/lib/billing/constants";
import { DEFAULT_SEED_COUNT_PER_VENDOR, DEFAULT_SEED_MONTHS_BACK, seedVerificationHistoryForVendor } from "@/lib/billing/demoSeed";
import { runVendorInvoiceGenerationForVendor } from "@/lib/billing/invoices";
import { requireVendorInvoiceOwnerContext } from "@/lib/billing/vendorAuthorization";
import { prisma } from "@/lib/db/prisma";
import { billingPeriodEndUtc, billingPeriodKeyFromDate } from "@/lib/vendors/verificationBilling";

/**
 * A real deployment only ever invoices a month once it's genuinely over —
 * but a one-click test button needs to work the moment you seed data,
 * without waiting for the calendar. This computes "just past when the
 * *current* month would naturally close" and feeds it through as `now`,
 * exactly the same mechanism `billing-invoices.ts --as-of` already uses —
 * not a new bypass of the closing check, just an honestly-later `now`.
 */
function forceCurrentPeriodClosedNow(): Date {
  const currentPeriodKey = billingPeriodKeyFromDate(new Date());
  const currentPeriodEnd = billingPeriodEndUtc(currentPeriodKey);
  return new Date(currentPeriodEnd.getTime() + INVOICE_CLOSING_DELAY_SECONDS * 1000 + 1_000);
}

/**
 * Creates fake, already-completed verification history for the signed-in
 * vendor only — never any other vendor's data, since `vendorProfileId`
 * always comes from the owner's own session context, never from input.
 */
export async function seedOwnVerificationHistoryAction(count?: number, monthsBack?: number) {
  const { context } = await requireVendorInvoiceOwnerContext();

  const created = await seedVerificationHistoryForVendor(prisma, {
    vendorProfileId: context.vendorProfileId,
    count: count ?? DEFAULT_SEED_COUNT_PER_VENDOR,
    monthsBack: monthsBack ?? DEFAULT_SEED_MONTHS_BACK,
  });

  revalidatePath("/vendor/test-tools");
  return { created };
}

/**
 * Turns the signed-in vendor's own unbilled verification history into
 * charges, then generates any invoices now due from those charges — scoped
 * to this vendor only in both steps. Treats the *current* billing period as
 * already closed (see `forceCurrentPeriodClosedNow`) so a freshly-seeded
 * current-month verification is invoiceable immediately, rather than
 * waiting for the real calendar month to end. Past, genuinely-closed months
 * are unaffected either way.
 */
export async function generateOwnInvoicesAction() {
  const { context } = await requireVendorInvoiceOwnerContext();

  const backfill = await runVerificationBillingBackfill(prisma, { apply: true, vendorProfileId: context.vendorProfileId });
  const invoices = await runVendorInvoiceGenerationForVendor(prisma, context.vendorProfileId, { now: forceCurrentPeriodClosedNow() });

  revalidatePath("/vendor/invoices");
  revalidatePath("/vendor/test-tools");

  return { backfill, invoices };
}
