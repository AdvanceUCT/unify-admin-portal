/**
 * @fileoverview Server actions for `/vendors/invoices`.
 * @module app/(admin)/vendors/invoices/actions
 */

"use server";

import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/audit";
import { assertCan } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { runVendorInvoiceGeneration } from "@/lib/billing/invoices";
import { prisma } from "@/lib/db/prisma";

/**
 * `invoice:issue`. Runs the same idempotent generation service the CLI uses
 * (`npm run billing:invoices -- --apply`) — a manual rerun creates no
 * duplicate invoices, since eligibility and the `(vendor, period, currency)`
 * uniqueness constraint are unchanged either way.
 */
export async function generateMissingInvoicesAction() {
  const session = await requireRole(["SUPER_ADMIN", "ADMIN"]);
  assertCan("invoice:issue", session);

  const summary = await runVendorInvoiceGeneration(prisma);

  if (summary.skippedDisabled) {
    throw new Error("Invoice issuance is currently disabled (VERIFICATION_INVOICING_ENABLED is off).");
  }

  await writeAuditLog({
    action: "INVOICE_GENERATION_TRIGGERED",
    actorId: session.user.id,
    meta: {
      vendorsScanned: summary.vendorsScanned,
      invoicesIssued: summary.invoicesIssued,
      zeroTotalInvoices: summary.zeroTotalInvoices,
    },
  });

  revalidatePath("/vendors/invoices");
}
