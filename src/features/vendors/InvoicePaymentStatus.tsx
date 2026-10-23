/**
 * @fileoverview Invoice payment status and due date shared by the admin and vendor invoice views.
 * @module features/vendors/InvoicePaymentStatus
 */

import { StatusText, type StatusTone } from "@/components/ui/StatusText";

const PAYMENT_TONE: Record<string, StatusTone> = {
  OVERDUE: "danger",
  UNPAID: "warning",
  PAID: "success",
  NO_PAYMENT_REQUIRED: "neutral",
};

const dueDateFormatter = new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeZone: "Africa/Johannesburg" });

/** Shows OVERDUE in place of UNPAID once the due date has passed. */
export function InvoicePaymentStatus({ isOverdue, paymentStatus }: { isOverdue: boolean; paymentStatus: string }) {
  const status = isOverdue ? "OVERDUE" : paymentStatus;
  return <StatusText tone={PAYMENT_TONE[status] ?? "neutral"}>{status.replaceAll("_", " ")}</StatusText>;
}

/** A due date only matters while the invoice is unpaid; invoices issued before due dates existed have none. */
export function formatInvoiceDueDate(invoice: { dueAtIso: string | null; paymentStatus: string }) {
  return invoice.dueAtIso && invoice.paymentStatus === "UNPAID" ? dueDateFormatter.format(new Date(invoice.dueAtIso)) : null;
}
