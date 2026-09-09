/**
 * @fileoverview Shared, immutable document data consumed by both the HTML detail view and the PDF.
 *
 * Built once from a frozen, already-issued invoice; never recomputed from
 * current pricing or vendor/university profile data — an issued invoice's
 * contents are permanent regardless of later changes elsewhere.
 * @module lib/billing/invoiceDocument
 */

import { minorToDecimalString } from "@/lib/billing/money";
import { billingPeriodLabel } from "@/lib/vendors/verificationBilling";

export type InvoiceDocumentItem = {
  branchName: string;
  servicePeriodLabel: string;
  quantity: number;
  unitPriceDisplay: string;
  lineTotalDisplay: string;
};

export type InvoiceDocumentData = {
  invoiceNumber: string;
  isDemo: boolean;
  documentStatus: string;
  paymentStatus: string;
  issuedAtIso: string | null;
  dueAtIso: string | null;
  periodLabel: string;
  currency: string;
  issuer: { name: string; abbreviation: string; contactEmail: string };
  customer: { companyName: string; contactEmail: string };
  items: InvoiceDocumentItem[];
  totalDisplay: string;
  platformShareDisplay: string;
  universityShareDisplay: string;
  templateVersion: number;
};

type InvoiceRow = {
  invoiceNumber: string;
  isDemo: boolean;
  documentStatus: string;
  paymentStatus: string;
  periodKey: string;
  currency: string;
  issuedAt: Date | null;
  dueAt: Date | null;
  issuerSnapshot: unknown;
  customerSnapshot: unknown;
  totalMinor: bigint;
  platformShareMinor: bigint;
  universityShareMinor: bigint;
  templateVersion: number;
};

type InvoiceItemRow = {
  branchNameSnapshot: string;
  servicePeriodKey: string;
  quantity: number;
  unitPriceMinor: bigint;
  lineTotalMinor: bigint;
};

function readSnapshotString(snapshot: unknown, key: string): string {
  if (snapshot && typeof snapshot === "object" && key in snapshot) {
    const value = (snapshot as Record<string, unknown>)[key];
    if (typeof value === "string") return value;
  }
  return "";
}

export function buildInvoiceDocumentData(invoice: InvoiceRow, items: InvoiceItemRow[]): InvoiceDocumentData {
  return {
    invoiceNumber: invoice.invoiceNumber,
    isDemo: invoice.isDemo,
    documentStatus: invoice.documentStatus,
    paymentStatus: invoice.paymentStatus,
    issuedAtIso: invoice.issuedAt?.toISOString() ?? null,
    dueAtIso: invoice.dueAt?.toISOString() ?? null,
    periodLabel: billingPeriodLabel(invoice.periodKey),
    currency: invoice.currency,
    issuer: {
      name: readSnapshotString(invoice.issuerSnapshot, "name"),
      abbreviation: readSnapshotString(invoice.issuerSnapshot, "abbreviation"),
      contactEmail: readSnapshotString(invoice.issuerSnapshot, "contactEmail"),
    },
    customer: {
      companyName: readSnapshotString(invoice.customerSnapshot, "companyName"),
      contactEmail: readSnapshotString(invoice.customerSnapshot, "contactEmail"),
    },
    items: items.map((item) => ({
      branchName: item.branchNameSnapshot,
      servicePeriodLabel: billingPeriodLabel(item.servicePeriodKey),
      quantity: item.quantity,
      unitPriceDisplay: minorToDecimalString(item.unitPriceMinor, invoice.currency),
      lineTotalDisplay: minorToDecimalString(item.lineTotalMinor, invoice.currency),
    })),
    totalDisplay: minorToDecimalString(invoice.totalMinor, invoice.currency),
    platformShareDisplay: minorToDecimalString(invoice.platformShareMinor, invoice.currency),
    universityShareDisplay: minorToDecimalString(invoice.universityShareMinor, invoice.currency),
    templateVersion: invoice.templateVersion,
  };
}
