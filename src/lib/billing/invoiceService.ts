/**
 * @fileoverview Generates, lists, flags, and settles vendor verification invoices.
 * @module lib/billing/invoiceService
 */

import "server-only";

import { AuditAction } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit/audit";
import { prisma } from "@/lib/db/prisma";

const VERIFICATION_RATE_CENTS_KEY = "VERIFICATION_RATE_CENTS";
const DEFAULT_VERIFICATION_RATE_CENTS = 500;
const INVOICE_DUE_DAYS = 30;

/** Cents charged per verification, configurable via SystemConfig. */
export async function getVerificationRateCents(): Promise<number> {
  const config = await prisma.systemConfig.findUnique({
    where: { key: VERIFICATION_RATE_CENTS_KEY },
  });

  const parsed = config ? Number.parseInt(config.value, 10) : NaN;
  return Number.isFinite(parsed) ? parsed : DEFAULT_VERIFICATION_RATE_CENTS;
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

/** Marks an invoice paid and automatically reinstates a vendor suspended over it. */
export async function completeInvoicePayment(invoiceId: string, paystackReference: string) {
  const invoice = await prisma.vendorInvoice.update({
    where: { id: invoiceId },
    data: {
      status: "PAID",
      paidAt: new Date(),
      paystackReference,
    },
  });

  const vendorProfile = await prisma.vendorProfile.findUnique({
    where: { id: invoice.vendorProfileId },
    select: { suspendedForBilling: true },
  });

  if (vendorProfile?.suspendedForBilling) {
    await reinstateVendorBilling(invoice.vendorProfileId, "system");
  }
}
