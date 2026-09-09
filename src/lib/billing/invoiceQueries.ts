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
    document: buildInvoiceDocumentData(invoice, invoice.items),
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
