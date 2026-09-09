/**
 * @fileoverview Shared bounded-backoff polling for invoice payment status, used by both the Pay button and the payment-return page.
 * @module app/vendor/(portal)/invoices/paymentPolling
 */

export type InvoiceStatusSnapshot = { paymentStatus: string; hasUnresolvedException: boolean };

/** ~31s of bounded backoff before handing control back to an explicit "Refresh status" action. */
export const POLL_DELAYS_MS = [2_000, 3_000, 5_000, 8_000, 13_000];

const SETTLED_STATUSES = new Set(["PAID", "NO_PAYMENT_REQUIRED"]);

export function isSettledPaymentStatus(paymentStatus: string) {
  return SETTLED_STATUSES.has(paymentStatus);
}

export async function fetchInvoiceStatus(invoiceId: string): Promise<InvoiceStatusSnapshot> {
  const response = await fetch(`/api/vendor/invoices/${invoiceId}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(response.status === 401 ? "Your session has expired. Sign in again to see the latest status." : "Unable to check invoice status.");
  }
  const data = (await response.json()) as InvoiceStatusSnapshot;
  return data;
}

function sleep(delayMs: number) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

/**
 * Polls with bounded backoff until the invoice settles or the delays run
 * out. Never throws for a normal "still not settled" outcome — only for a
 * genuine fetch failure, so the caller can distinguish "keep waiting" from
 * "something is actually wrong".
 */
export async function pollUntilSettled(
  invoiceId: string,
  options: { isCancelled: () => boolean; onSnapshot?: (snapshot: InvoiceStatusSnapshot) => void } = { isCancelled: () => false },
): Promise<InvoiceStatusSnapshot | null> {
  for (const delayMs of POLL_DELAYS_MS) {
    if (options.isCancelled()) return null;
    await sleep(delayMs);
    if (options.isCancelled()) return null;

    const snapshot = await fetchInvoiceStatus(invoiceId);
    options.onSnapshot?.(snapshot);
    if (isSettledPaymentStatus(snapshot.paymentStatus)) return snapshot;
  }
  return null;
}
