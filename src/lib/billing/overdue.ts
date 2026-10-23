/**
 * @fileoverview The single definition of an overdue vendor invoice, shared by suspension and display.
 *
 * Deliberately not "server-only" and free of database access so page code,
 * queries, and the suspension job all agree on exactly one rule
 * (docs/vendor-verification-suspension-plan.md).
 * @module lib/billing/overdue
 */

import type { Prisma } from "@/generated/prisma/client";
import { VendorInvoiceDocumentStatus, VendorInvoicePaymentStatus } from "@/generated/prisma/enums";

/**
 * Issued, still unpaid, and past its due date. Invoices issued before due
 * dates existed keep `dueAt` null and are never overdue.
 */
export function overdueInvoiceWhere(now: Date) {
  return {
    documentStatus: VendorInvoiceDocumentStatus.ISSUED,
    paymentStatus: VendorInvoicePaymentStatus.UNPAID,
    dueAt: { lte: now },
  } satisfies Prisma.VendorInvoiceWhereInput;
}

/** In-memory twin of `overdueInvoiceWhere` for invoices that are already loaded. */
export function isInvoiceOverdue(
  invoice: { documentStatus: string; paymentStatus: string; dueAt: Date | null },
  now: Date,
) {
  return (
    invoice.documentStatus === VendorInvoiceDocumentStatus.ISSUED &&
    invoice.paymentStatus === VendorInvoicePaymentStatus.UNPAID &&
    invoice.dueAt !== null &&
    invoice.dueAt <= now
  );
}
