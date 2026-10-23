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
import { INVOICE_PAYMENT_DUE_DAYS_MAX } from "@/lib/billing/constants";
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

export type InvoicePaymentWindowResult = { status: "saved" } | { status: "error"; message: string };

/**
 * SUPER_ADMIN only (`billing-policy:manage`). Sets how many days a vendor has
 * to pay an invoice before its verifications are suspended. Applies to
 * invoices issued after the change; issued invoices keep their due date.
 */
export async function updateInvoicePaymentWindowAction(formData: FormData): Promise<InvoicePaymentWindowResult> {
  const session = await requireRole(["SUPER_ADMIN"]);
  assertCan("billing-policy:manage", session);

  const input = String(formData.get("invoicePaymentDueDays") ?? "").trim();
  const days = /^\d+$/.test(input) ? Number(input) : NaN;
  if (!(days >= 1 && days <= INVOICE_PAYMENT_DUE_DAYS_MAX)) {
    return {
      status: "error",
      message: `The payment window must be a whole number of days between 1 and ${INVOICE_PAYMENT_DUE_DAYS_MAX}.`,
    };
  }

  const universityId = await requireSingleUniversityId(prisma);
  await prisma.$transaction(async (tx) => {
    const current = await tx.universityProfile.findUniqueOrThrow({
      where: { id: universityId },
      select: { invoicePaymentDueDays: true },
    });
    await tx.universityProfile.update({ where: { id: universityId }, data: { invoicePaymentDueDays: days } });
    await writeAuditLog({
      action: "INVOICE_PAYMENT_WINDOW_UPDATED",
      actorId: session.user.id,
      targetType: "UniversityProfile",
      targetId: universityId,
      meta: { oldInvoicePaymentDueDays: current.invoicePaymentDueDays, newInvoicePaymentDueDays: days },
    }, tx);
  });

  revalidatePath("/settings/verification-billing");
  return { status: "saved" };
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
