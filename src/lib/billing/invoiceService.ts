/**
 * @fileoverview Generates, lists, flags, and settles vendor verification invoices.
 * @module lib/billing/invoiceService
 */

import "server-only";

import { AuditAction } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit/audit";
import { env } from "@/lib/config/env";
import { prisma } from "@/lib/db/prisma";
import { initializeTransaction } from "@/lib/payments/paystackService";

const VERIFICATION_RATE_CENTS_KEY = "VERIFICATION_RATE_CENTS";
const DEFAULT_VERIFICATION_RATE_CENTS = 500;
const MAX_VERIFICATION_RATE_CENTS = 100_000;
const INVOICE_DUE_DAYS = 30;

/** Cents charged per verification, configurable via SystemConfig. */
export async function getVerificationRateCents(): Promise<number> {
  const config = await prisma.systemConfig.findUnique({
    where: { key: VERIFICATION_RATE_CENTS_KEY },
  });

  const parsed = config ? Number.parseInt(config.value, 10) : NaN;
  return Number.isFinite(parsed) ? parsed : DEFAULT_VERIFICATION_RATE_CENTS;
}

/** Updates the configured per-verification rate. Only affects invoices generated after this call. */
export async function setVerificationRateCents(rateCents: number, adminUserId: string): Promise<void> {
  if (!Number.isFinite(rateCents) || rateCents <= 0) {
    throw new Error("Rate must be greater than zero.");
  }
  if (rateCents > MAX_VERIFICATION_RATE_CENTS) {
    throw new Error("Rate must not exceed R1000 per verification.");
  }

  const oldRate = await getVerificationRateCents();

  await prisma.$transaction(async (transaction) => {
    await transaction.systemConfig.upsert({
      where: { key: VERIFICATION_RATE_CENTS_KEY },
      create: { key: VERIFICATION_RATE_CENTS_KEY, value: rateCents.toString() },
      update: { value: rateCents.toString() },
    });

    await writeAuditLog(
      {
        action: AuditAction.VERIFICATION_RATE_CHANGED,
        actorId: adminUserId,
        targetType: "system_config",
        targetId: VERIFICATION_RATE_CENTS_KEY,
        meta: { oldRate, newRate: rateCents },
      },
      transaction,
    );
  });
}

const VENDOR_SUSPENSION_INCLUDE = {
  vendorProfile: { select: { suspendedForBilling: true } },
} as const;

/** Unpaid or flagged invoices whose due date has passed, oldest first. */
export async function getOverdueInvoices() {
  return prisma.vendorInvoice.findMany({
    where: {
      status: { in: ["UNPAID", "FLAGGED"] },
      dueDate: { lt: new Date() },
    },
    include: VENDOR_SUSPENSION_INCLUDE,
    orderBy: { dueDate: "asc" },
  });
}

/** All invoices, optionally filtered by status and/or vendor, most recently created first. */
export async function getAllInvoices(filters: { status?: string; vendorProfileId?: string } = {}) {
  return prisma.vendorInvoice.findMany({
    where: {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.vendorProfileId ? { vendorProfileId: filters.vendorProfileId } : {}),
    },
    include: VENDOR_SUSPENSION_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
}

/** Count of vendors currently suspended for non-payment. */
export async function getSuspendedVendorCount() {
  return prisma.vendorProfile.count({ where: { suspendedForBilling: true } });
}

/** All invoices for a single vendor, most recent billing period first. */
export async function getVendorInvoices(vendorProfileId: string) {
  return prisma.vendorInvoice.findMany({
    where: { vendorProfileId },
    orderBy: { periodStart: "desc" },
  });
}

/** The vendor's most recent unpaid or flagged invoice, if any. */
export async function getVendorCurrentInvoice(vendorProfileId: string) {
  return prisma.vendorInvoice.findFirst({
    where: { vendorProfileId, status: { in: ["UNPAID", "FLAGGED"] } },
    orderBy: { periodEnd: "desc" },
  });
}

/** Vendor-facing billing summary: current balance due, lifetime totals, and full invoice history. */
export async function getVendorInvoiceSummary(vendorProfileId: string) {
  const allInvoices = await getVendorInvoices(vendorProfileId);

  let totalPaidCents = 0;
  let totalUnpaidCents = 0;
  let currentInvoice: (typeof allInvoices)[number] | null = null;

  for (const invoice of allInvoices) {
    if (invoice.status === "PAID") {
      totalPaidCents += invoice.totalCents;
    } else {
      totalUnpaidCents += invoice.totalCents;
      if (
        (invoice.status === "UNPAID" || invoice.status === "FLAGGED") &&
        (!currentInvoice || invoice.periodEnd > currentInvoice.periodEnd)
      ) {
        currentInvoice = invoice;
      }
    }
  }

  return {
    currentInvoice,
    totalPaidCents,
    totalUnpaidCents,
    invoiceCount: allInvoices.length,
    allInvoices,
  };
}

/** Starts a Paystack checkout for an invoice and returns the URL to redirect the vendor to. */
export async function initiateInvoicePayment(
  invoiceId: string,
  vendorProfileId: string,
  vendorEmail: string,
): Promise<{ authorizationUrl: string; reference: string }> {
  const invoice = await prisma.vendorInvoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) {
    throw new Error("Invoice not found.");
  }
  if (invoice.vendorProfileId !== vendorProfileId) {
    throw new Error("Unauthorized");
  }
  if (invoice.status === "PAID") {
    throw new Error("Invoice is already paid");
  }
  if (invoice.status !== "UNPAID" && invoice.status !== "FLAGGED") {
    throw new Error("Invoice cannot be paid in its current state.");
  }
  if (invoice.totalCents <= 0) {
    throw new Error("Invoice has no amount due.");
  }

  const reference = `inv-${invoiceId}-${Date.now()}`;
  const { authorizationUrl } = await initializeTransaction({
    amountCents: invoice.totalCents,
    email: vendorEmail,
    reference,
    callbackUrl: new URL("/api/vendor/invoices/callback", env.APP_URL).toString(),
    metadata: {
      invoiceId,
      vendorProfileId,
      type: "INVOICE_PAYMENT",
    },
  });

  return { authorizationUrl, reference };
}

/** Flags an invoice as overdue for admin attention. Notes are mandatory so the reason is on record. */
export async function flagVendorInvoice(invoiceId: string, adminUserId: string, notes: string) {
  const trimmedNotes = notes.trim();
  if (!trimmedNotes) {
    throw new Error("Notes are required to flag an invoice.");
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.vendorInvoice.update({
      where: { id: invoiceId },
      data: {
        status: "FLAGGED",
        flaggedAt: new Date(),
        flaggedByUserId: adminUserId,
        flagNotes: trimmedNotes,
      },
    });

    await writeAuditLog(
      {
        action: AuditAction.VENDOR_INVOICE_FLAGGED,
        actorId: adminUserId,
        targetType: "vendor_invoice",
        targetId: invoiceId,
        meta: { notes: trimmedNotes },
      },
      transaction,
    );
  });
}

/** Suspends a vendor's verification access for non-payment and flags the triggering invoice. */
export async function suspendVendorForBilling(
  vendorProfileId: string,
  adminUserId: string,
  invoiceId: string,
) {
  await prisma.$transaction(async (transaction) => {
    await transaction.vendorProfile.update({
      where: { id: vendorProfileId },
      data: {
        suspendedForBilling: true,
        paymentStatus: "SUSPENDED",
      },
    });

    await transaction.vendorInvoice.updateMany({
      where: { id: invoiceId, status: { not: "FLAGGED" } },
      data: {
        status: "FLAGGED",
        flaggedAt: new Date(),
        flaggedByUserId: adminUserId,
      },
    });

    await writeAuditLog(
      {
        action: AuditAction.VENDOR_SUSPENDED_FOR_BILLING,
        actorId: adminUserId,
        targetType: "vendor_profile",
        targetId: vendorProfileId,
        meta: { invoiceId },
      },
      transaction,
    );
  });
}

/** Restores a suspended vendor's verification access. */
export async function reinstateVendorBilling(vendorProfileId: string, adminUserId: string) {
  await prisma.$transaction(async (transaction) => {
    await transaction.vendorProfile.update({
      where: { id: vendorProfileId },
      data: {
        suspendedForBilling: false,
        paymentStatus: "GOOD_STANDING",
      },
    });

    await writeAuditLog(
      {
        action: AuditAction.VENDOR_BILLING_REINSTATED,
        actorId: adminUserId,
        targetType: "vendor_profile",
        targetId: vendorProfileId,
      },
      transaction,
    );
  });
}

/** Creates an invoice for a billing period, priced at the current configured verification rate. */
export async function generateInvoiceForVendor(
  vendorProfileId: string,
  vendorName: string,
  verificationCount: number,
  periodStart: Date,
  periodEnd: Date,
) {
  const rateCents = await getVerificationRateCents();
  const totalCents = verificationCount * rateCents;
  const dueDate = new Date(periodEnd);
  dueDate.setDate(dueDate.getDate() + INVOICE_DUE_DAYS);

  return prisma.vendorInvoice.create({
    data: {
      vendorProfileId,
      vendorName,
      periodStart,
      periodEnd,
      verificationCount,
      ratePerVerification: rateCents,
      totalCents,
      status: "UNPAID",
      dueDate,
    },
  });
}

/**
 * Marks an invoice paid and automatically reinstates a vendor suspended over it.
 * Idempotent — both the Paystack redirect callback and the webhook can call this
 * for the same payment, so a second call for an already-PAID invoice is a no-op.
 */
export async function completeInvoicePayment(invoiceId: string, paystackReference: string): Promise<void> {
  await prisma.$transaction(async (transaction) => {
    const invoice = await transaction.vendorInvoice.findUnique({ where: { id: invoiceId } });
    if (!invoice || invoice.status === "PAID") return;

    await transaction.vendorInvoice.update({
      where: { id: invoiceId },
      data: {
        status: "PAID",
        paidAt: new Date(),
        paystackReference,
      },
    });

    const vendorProfile = await transaction.vendorProfile.findUnique({
      where: { id: invoice.vendorProfileId },
      select: { suspendedForBilling: true },
    });

    if (vendorProfile?.suspendedForBilling) {
      await transaction.vendorProfile.update({
        where: { id: invoice.vendorProfileId },
        data: { suspendedForBilling: false, paymentStatus: "GOOD_STANDING" },
      });

      await writeAuditLog(
        {
          action: AuditAction.VENDOR_BILLING_REINSTATED,
          targetType: "vendor_profile",
          targetId: invoice.vendorProfileId,
          meta: { invoiceId, reason: "invoice_paid" },
        },
        transaction,
      );
    }

    // No Wallet/LedgerEntry models exist in this schema yet, so payment ledger
    // recording is intentionally skipped until that system is introduced.

    await writeAuditLog(
      {
        action: AuditAction.VENDOR_INVOICE_PAID,
        targetType: "vendor_invoice",
        targetId: invoiceId,
        meta: { invoiceId, paystackReference, vendorProfileId: invoice.vendorProfileId },
      },
      transaction,
    );
  });
}
