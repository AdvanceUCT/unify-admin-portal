/**
 * @fileoverview Server actions for `/settings/verification-billing`.
 * @module app/(admin)/settings/verification-billing/actions
 */

"use server";

import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/audit";
import { assertCan } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { requireSingleUniversityId } from "@/lib/billing/config";
import { runVendorInvoiceGeneration } from "@/lib/billing/invoices";
import { parsePercentageToBasisPoints } from "@/lib/billing/money";
import { createFollowUpVerificationBillingPolicy } from "@/lib/billing/policy";
import { prisma } from "@/lib/db/prisma";

/**
 * SUPER_ADMIN only (`billing-policy:manage`). Creates a new policy version
 * effective immediately — never edits an existing policy, charge, or
 * invoice. See `createFollowUpVerificationBillingPolicy` for the
 * close-current/open-new transaction this wraps.
 */
export async function updateVerificationBillingPolicyAction(formData: FormData) {
  const session = await requireRole(["SUPER_ADMIN"]);
  assertCan("billing-policy:manage", session);

  const feeInput = String(formData.get("verificationFee") ?? "").trim();
  const percentageInput = String(formData.get("platformPercentage") ?? "").trim();

  const feeMajor = Number(feeInput);
  if (!Number.isFinite(feeMajor) || feeMajor < 0) {
    throw new Error("Verification fee must be a nonnegative number, e.g. 1.25.");
  }
  const verificationFeeMinor = BigInt(Math.round(feeMajor * 100));
  const platformBasisPoints = parsePercentageToBasisPoints(percentageInput);

  const universityId = await requireSingleUniversityId(prisma);
  await createFollowUpVerificationBillingPolicy(
    { universityId, verificationFeeMinor, platformBasisPoints, actorUserId: session.user.id },
    prisma,
  );

  revalidatePath("/settings/verification-billing");
}

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

  revalidatePath("/settings/verification-billing");
}
