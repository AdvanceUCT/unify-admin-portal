/**
 * @fileoverview Renders the live-updating payments table used by `/vendor/payments`.
 * @module app/vendor/(portal)/payments/LivePaymentTable
 */

"use client";

import { Loader2, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { StatusText, type StatusTone } from "@/components/ui/StatusText";
import { RefundRecoveryPanel, useRefundRecovery } from "@/features/vendors/useRefundRecovery";
import { RefundPaymentDialog, type RefundGuidance } from "@/features/vendors/RefundPaymentDialog";
import { formatDateTime, formatMoneyMinor } from "@/lib/formatters";
import { type LivePaymentEvent } from "@/features/vendors/LivePaymentList";
import type { VendorPaymentEventFilters } from "@/lib/vendors/livePayments";

const REFUND_STATUS_LABEL: Record<LivePaymentEvent["refundStatus"], string> = {
  NONE: "Not refunded",
  PARTIALLY_REFUNDED: "Partially refunded",
  FULLY_REFUNDED: "Fully refunded",
};

const REFUND_STATUS_TONE: Record<LivePaymentEvent["refundStatus"], StatusTone> = {
  NONE: "neutral",
  PARTIALLY_REFUNDED: "warning",
  FULLY_REFUNDED: "warning",
};


export function LivePaymentTable({
  activePaymentBranchIds,
  filters,
  initialItems,
  liveCursor,
  refundGuidance,
}: {
  activePaymentBranchIds: string[];
  filters: VendorPaymentEventFilters;
  initialItems: LivePaymentEvent[];
  liveCursor?: string;
  refundGuidance?: RefundGuidance;
}) {
  const [items, setItems] = useState(initialItems);
  const [guidance, setGuidance] = useState(refundGuidance);
  const recovery = useRefundRecovery();
  const [refundMessage, setRefundMessage] = useState<string>();
  const [refundPaymentToConfirm, setRefundPaymentToConfirm] = useState<LivePaymentEvent | null>(null);

  const filtersKey = useMemo(() => JSON.stringify(filters), [filters]);
  const activePaymentBranchIdSet = useMemo(() => new Set(activePaymentBranchIds), [activePaymentBranchIds]);

  useEffect(() => {
    if (!liveCursor) return;
    let cancelled = false;
    let controller: AbortController | null = null;
    let cursor = liveCursor;
    let polling = false;

    async function poll() {
      if (cancelled || document.visibilityState !== "visible" || polling) return;
      polling = true;
      controller = new AbortController();
      try {
        const params = new URLSearchParams({ cursor });
        if (filters.branchId) params.set("branchId", filters.branchId);
        const response = await fetch(`/api/vendor/live-payments?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const result = await response.json() as { events: LivePaymentEvent[]; nextCursor: string };
        if (cancelled) return;
        cursor = result.nextCursor;
        const incoming = result.events
          .filter((event) => matchesFilters(event, filters))
          .reverse();
        if (incoming.length === 0) return;
        setItems((current) => {
          const known = new Set(current.map((item) => item.transactionId));
          const next = incoming.filter((item) => !known.has(item.transactionId));
          return next.length > 0 ? [...next, ...current] : current;
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      } finally {
        controller = null;
        polling = false;
      }
    }

    void poll();
    const timer = window.setInterval(() => void poll(), 2_000);
    const onVisibility = () => { if (document.visibilityState === "visible") void poll(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      controller?.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [filters, filtersKey, liveCursor]);

  useEffect(() => recovery.client.subscribe(() => {
    const result = recovery.client.getSnapshot().outcome?.result;
    if (!result) return;
    setGuidance(current => current && { ...current, walletBalanceMinor: result.vendorBalanceMinor });
    setItems(current => current.map(item => item.transactionId === result.originalTransactionId ? { ...item, totalRefundedMinor: result.totalRefundedMinor, remainingRefundableMinor: result.remainingRefundableMinor, refundStatus: result.refundStatus, canRefund: item.canRefund && result.remainingRefundableMinor > 0 } : item));
    setRefundMessage(`Refunded ${formatMoneyMinor(result.refundedAmountMinor)}.`);
    setRefundPaymentToConfirm(null);
  }), [recovery.client]);

  function refundPayment(payment: LivePaymentEvent, amountMinor: number) {
    if (payment.canRefund && !recovery.blocked) void recovery.client.submit({ transactionId: payment.transactionId, amountMinor });
  }

  return (
    <>
      <RefundRecoveryPanel recovery={recovery} />
      {refundMessage ? (
        <p className="border-b border-border bg-surface-muted px-5 py-3 text-sm text-fg-muted">
          {refundMessage}
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[72rem] text-center text-body">
          <thead className="border-b border-border bg-surface-muted/60">
            <tr className="whitespace-nowrap text-caption uppercase tracking-wide text-fg-subtle">
              <th className="px-4 py-3 font-medium">Completed</th>
              <th className="px-4 py-3 font-medium">Branch</th>
              <th className="px-4 py-3 font-medium">Student</th>
              <th className="px-4 py-3 font-medium">Student number</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Refunded</th>
              <th className="px-4 py-3 font-medium">Refund status</th>
              <th className="px-4 py-3 font-medium">Reference</th>
              <th className="px-4 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((payment) => {
              const canRefundPayment =
                payment.canRefund &&
                activePaymentBranchIdSet.has(payment.branchId);

              return (
                <tr className="align-middle transition hover:bg-surface-muted/60" key={payment.transactionId}>
                  <td className="whitespace-nowrap px-4 py-3 text-fg-muted">{formatDateTime(payment.completedAt)}</td>
                  <td className="px-4 py-3 font-medium text-fg">{payment.branchName}</td>
                  <td className="px-4 py-3 font-medium text-fg">{payment.studentName}</td>
                  <td className="px-4 py-3 text-fg-muted">{payment.studentNumber}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold tabular-nums text-success-fg">
                    {formatMoneyMinor(payment.amountMinor, payment.currency)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-fg-muted">
                    {payment.totalRefundedMinor > 0 ? formatMoneyMinor(payment.totalRefundedMinor, payment.currency) : "-"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusText tone={REFUND_STATUS_TONE[payment.refundStatus]}>
                      {REFUND_STATUS_LABEL[payment.refundStatus]}
                    </StatusText>
                  </td>
                  <td className="max-w-44 truncate px-4 py-3 font-mono text-xs text-fg-muted">
                    {payment.reference ?? payment.transactionId}
                  </td>
                  <td className="px-4 py-3">
                    {canRefundPayment ? (
                      <button
                        className="inline-flex h-9 min-w-24 items-center justify-center gap-1.5 rounded-md bg-brand-600 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-fg-subtle disabled:shadow-none"
                        disabled={recovery.blocked}
                        onClick={() => setRefundPaymentToConfirm(payment)}
                        type="button"
                      >
                        {recovery.state.busy ? (
                          <Loader2 aria-hidden="true" className="animate-spin" size={14} />
                        ) : (
                          <RotateCcw aria-hidden="true" size={14} />
                        )}
                        {recovery.state.busy ? "Refunding" : "Refund"}
                      </button>
                    ) : (
                      <span className="text-xs text-fg-subtle">
                        {guidance?.paymentsSuspended && payment.remainingRefundableMinor > 0
                          ? "Payments suspended"
                          : "No action"}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {items.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-fg-subtle">
            No wallet payments match these filters.
          </p>
        )}
      </div>
      <RefundPaymentDialog
        guidance={guidance}
        isPending={recovery.blocked}
        onClose={() => setRefundPaymentToConfirm(null)}
        onConfirm={(amountMinor) => {
          if (refundPaymentToConfirm) void refundPayment(refundPaymentToConfirm, amountMinor);
        }}
        payment={refundPaymentToConfirm}
      />
    </>
  );
}
