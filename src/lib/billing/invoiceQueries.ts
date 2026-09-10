/**
 * @fileoverview Read-only invoice queries for the vendor owner portal and admin receivables views.
 * @module lib/billing/invoiceQueries
 */

import "server-only";

import { minorToDecimalString } from "@/lib/billing/money";
import { buildInvoiceDocumentData } from "@/lib/billing/invoiceDocument";
import { prisma } from "@/lib/db/prisma";
import { billingPeriodLabel } from "@/lib/vendors/verificationBilling";

export type VendorInvoiceSummary = {
  id: string;
  invoiceNumber: string;
  periodKey: string;
  periodLabel: string;
  currency: string;
  totalDisplay: string;
  documentStatus: string;
  paymentStatus: string;
  hasUnresolvedException: boolean;
  isDemo: boolean;
  issuedAtIso: string | null;
};

function toSummary(invoice: {
  id: string;
  invoiceNumber: string;
  periodKey: string;
  currency: string;
  totalMinor: bigint;
  documentStatus: string;
  paymentStatus: string;
  hasUnresolvedException: boolean;
  isDemo: boolean;
  issuedAt: Date | null;
}): VendorInvoiceSummary {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    periodKey: invoice.periodKey,
    periodLabel: billingPeriodLabel(invoice.periodKey),
    currency: invoice.currency,
    totalDisplay: minorToDecimalString(invoice.totalMinor, invoice.currency),
    documentStatus: invoice.documentStatus,
    paymentStatus: invoice.paymentStatus,
    hasUnresolvedException: invoice.hasUnresolvedException,
    isDemo: invoice.isDemo,
    issuedAtIso: invoice.issuedAt?.toISOString() ?? null,
  };
}

/** Tenant scoping (`vendorProfileId`) is the security boundary — never trust a URL-supplied vendor ID alone. */
export async function listVendorInvoices(vendorProfileId: string): Promise<VendorInvoiceSummary[]> {
  const invoices = await prisma.vendorInvoice.findMany({
    where: { vendorProfileId, documentStatus: { not: "DRAFT" } },
    orderBy: { periodKey: "desc" },
    select: {
      id: true,
      invoiceNumber: true,
      periodKey: true,
      currency: true,
      totalMinor: true,
      documentStatus: true,
      paymentStatus: true,
      hasUnresolvedException: true,
      isDemo: true,
      issuedAt: true,
    },
  });
  return invoices.map(toSummary);
}

/** Returns null for a missing invoice *or* one belonging to a different vendor — same response either way. */
export async function getVendorInvoiceDocument(vendorProfileId: string, invoiceId: string) {
  const invoice = await prisma.vendorInvoice.findFirst({
    where: { id: invoiceId, vendorProfileId, documentStatus: { not: "DRAFT" } },
    include: { items: { orderBy: [{ servicePeriodKey: "asc" }, { createdAt: "asc" }] } },
  });
  if (!invoice) return null;

  return {
    id: invoice.id,
    paymentStatus: invoice.paymentStatus,
    hasUnresolvedException: invoice.hasUnresolvedException,
    // A raw totalMinor is never sent to the client — this boolean is the only
    // signal the Pay button needs. A paid, zero-total, or exception-flagged
    // invoice never gets a Pay action, per the handoff.
    isPayable:
      invoice.documentStatus === "ISSUED" &&
      invoice.paymentStatus === "UNPAID" &&
      invoice.totalMinor > BigInt(0) &&
      !invoice.hasUnresolvedException,
    document: buildInvoiceDocumentData(invoice, invoice.items),
  };
}

export type VendorInvoiceYearHistory = {
  selectedYear: number;
  availableYears: number[];
  invoices: VendorInvoiceSummary[];
};

function yearFromPeriodKey(periodKey: string): number {
  return Number(periodKey.slice(0, 4));
}

/**
 * The vendor's own invoice history, scoped to one calendar year — powers the
 * admin verification-history page's "Invoices" section, one vendor at a
 * time, so a growing vendor roster never means one giant cross-vendor table.
 * Falls back to the current year if the requested one has no invoices,
 * mirroring `getVendorMonthlyVerificationHistory`'s year-selection behavior.
 */
export async function getVendorInvoiceHistory(
  vendorProfileId: string,
  options: { year?: number; now?: Date } = {},
): Promise<VendorInvoiceYearHistory> {
  const invoices = await listVendorInvoices(vendorProfileId);
  const currentYear = (options.now ?? new Date()).getUTCFullYear();

  const years = new Set<number>([currentYear]);
  for (const invoice of invoices) years.add(yearFromPeriodKey(invoice.periodKey));
  const availableYears = Array.from(years).sort((left, right) => right - left);
  const selectedYear = options.year && availableYears.includes(options.year) ? options.year : currentYear;

  return {
    selectedYear,
    availableYears,
    invoices: invoices.filter((invoice) => yearFromPeriodKey(invoice.periodKey) === selectedYear),
  };
}

export type AdminInvoiceReceivable = VendorInvoiceSummary & {
  vendorProfileId: string;
  vendorCompanyName: string;
};

/** Admin reporting view: every vendor's invoices, optionally scoped to one vendor. */
export async function listAdminInvoiceReceivables(options: { vendorProfileId?: string } = {}): Promise<AdminInvoiceReceivable[]> {
  const invoices = await prisma.vendorInvoice.findMany({
    where: {
      documentStatus: { not: "DRAFT" },
      ...(options.vendorProfileId ? { vendorProfileId: options.vendorProfileId } : {}),
    },
    orderBy: [{ periodKey: "desc" }, { vendorProfileId: "asc" }],
    include: { vendorProfile: { select: { companyName: true } } },
  });

  return invoices.map((invoice) => ({
    ...toSummary(invoice),
    vendorProfileId: invoice.vendorProfileId,
    vendorCompanyName: invoice.vendorProfile.companyName,
  }));
}

export type AdminInvoicePaymentAttemptRow = {
  id: string;
  status: string;
  reference: string;
  expectedAmountDisplay: string;
  createdAtIso: string;
  updatedAtIso: string;
  providerTransactionId: string | null;
};

export type AdminInvoicePaymentRow = {
  id: string;
  providerTransactionId: string;
  grossAmountDisplay: string;
  paidAtIso: string;
};

export type AdminInvoiceExceptionRow = {
  id: string;
  type: string;
  resolved: boolean;
  createdAtIso: string;
  details: unknown;
};

/** Full admin view of one invoice: document contents plus its payment/attempt/exception history. */
export async function getAdminInvoiceDetail(invoiceId: string) {
  const invoice = await prisma.vendorInvoice.findUnique({
    where: { id: invoiceId },
    include: {
      items: { orderBy: [{ servicePeriodKey: "asc" }, { createdAt: "asc" }] },
      vendorProfile: { select: { companyName: true } },
      paymentAttempts: { orderBy: { createdAt: "desc" }, include: { payment: { include: { allocation: true } } } },
    },
  });
  if (!invoice) return null;

  const exceptions = await prisma.billingException.findMany({
    where: { invoiceId },
    orderBy: { createdAt: "desc" },
  });

  const attempts: AdminInvoicePaymentAttemptRow[] = invoice.paymentAttempts.map((attempt) => ({
    id: attempt.id,
    status: attempt.status,
    reference: attempt.reference,
    expectedAmountDisplay: minorToDecimalString(attempt.expectedAmountMinor, attempt.currency),
    createdAtIso: attempt.createdAt.toISOString(),
    updatedAtIso: attempt.updatedAt.toISOString(),
    providerTransactionId: attempt.providerTransactionId,
  }));

  const payments: AdminInvoicePaymentRow[] = invoice.paymentAttempts
    .filter((attempt) => attempt.payment)
    .map((attempt) => ({
      id: attempt.payment!.id,
      providerTransactionId: attempt.payment!.providerTransactionId,
      grossAmountDisplay: minorToDecimalString(attempt.payment!.grossAmountMinor, attempt.payment!.currency),
      paidAtIso: attempt.payment!.paidAt.toISOString(),
    }));

  return {
    id: invoice.id,
    vendorProfileId: invoice.vendorProfileId,
    vendorCompanyName: invoice.vendorProfile.companyName,
    paymentStatus: invoice.paymentStatus,
    hasUnresolvedException: invoice.hasUnresolvedException,
    document: buildInvoiceDocumentData(invoice, invoice.items),
    attempts,
    payments,
    exceptions: exceptions.map(
      (exception): AdminInvoiceExceptionRow => ({
        id: exception.id,
        type: exception.type,
        resolved: exception.resolved,
        createdAtIso: exception.createdAt.toISOString(),
        details: exception.details,
      }),
    ),
  };
}
