/**
 * @fileoverview Server actions for `/vendor/test-tools` — self-service demo data, scoped to the signed-in vendor only.
 * @module app/vendor/(portal)/test-tools/actions
 */

"use server";

import { revalidatePath } from "next/cache";

import { runVerificationBillingBackfill } from "@/lib/billing/backfill";
import { DEFAULT_SEED_COUNT_PER_VENDOR, DEFAULT_SEED_MONTHS_BACK, seedVerificationHistoryForVendor } from "@/lib/billing/demoSeed";
import { runVendorInvoiceGenerationForVendor } from "@/lib/billing/invoices";
import { requireVendorInvoiceOwnerContext } from "@/lib/billing/vendorAuthorization";
import { prisma } from "@/lib/db/prisma";

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
 * to this vendor only in both steps.
 */
export async function generateOwnInvoicesAction() {
  const { context } = await requireVendorInvoiceOwnerContext();

  const backfill = await runVerificationBillingBackfill(prisma, { apply: true, vendorProfileId: context.vendorProfileId });
  const invoices = await runVendorInvoiceGenerationForVendor(prisma, context.vendorProfileId);

  revalidatePath("/vendor/invoices");
  revalidatePath("/vendor/test-tools");

  return { backfill, invoices };
}
