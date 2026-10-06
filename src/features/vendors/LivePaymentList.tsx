/**
 * @fileoverview Shows recent student wallet payments across permitted vendor branches.
 * @module features/vendors/LivePaymentList
 */

"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Avatar } from "@/components/ui/Avatar";
import { RefundRecoveryPanel, useRefundRecovery } from "@/features/vendors/useRefundRecovery";
import { RefundPaymentDialog, type RefundGuidance } from "@/features/vendors/RefundPaymentDialog";
import { formatDateTime, formatMoneyMinor } from "@/lib/formatters";

export type LivePaymentEvent = {
  eventId: string;
  transactionId: string;
  branchId: string;
  branchName: string;
  studentName: string;
  studentNumber: string;
  amountMinor: number;
  currency: "ZAR";
  completedAt: string;
  reference?: string;
  totalRefundedMinor: number;
  remainingRefundableMinor: number;
  refundStatus: "NONE" | "PARTIALLY_REFUNDED" | "FULLY_REFUNDED";
  canRefund: boolean;
};

export type RefundResponse = {
  originalTransactionId: string;
  refundTransactionId: string;
  refundedAmountMinor: number;
  totalRefundedMinor: number;
  remainingRefundableMinor: number;
  refundStatus: LivePaymentEvent["refundStatus"];
  /** May be negative once a refund overdraws the vendor wallet. */
  vendorBalanceMinor: number;
};

export function LivePaymentList({
  branchId,
  branchIds,
  initialItems,
  liveCursor,
  maxItems = 20,
  refundGuidance,
}: {
  branchId?: string;
  branchIds?: string[];
  initialItems: LivePaymentEvent[];
  liveCursor?: string;
  maxItems?: number;
  refundGuidance?: RefundGuidance;
}) {
  const [items, setItems] = useState(initialItems);
  const [guidance, setGuidance] = useState(refundGuidance);
  const recovery = useRefundRecovery();
  const [refundMessage, setRefundMessage] = useState<string>();
  const [refundPaymentToConfirm, setRefundPaymentToConfirm] = useState<LivePaymentEvent | null>(null);

  const itemsRef = useRef(initialItems);
  const branchIdsKey = useMemo(() => (branchIds ?? []).join("\u0000"), [branchIds]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

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
        if (branchId) {
          params.set("branchId", branchId);
        } else {
          for (const nextBranchId of branchIdsKey ? branchIdsKey.split("\u0000") : []) {
            params.append("branchId", nextBranchId);
          }
        }
        const response = await fetch(`/api/vendor/live-payments?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const result = await response.json() as { events: LivePaymentEvent[]; nextCursor: string };
        if (cancelled) return;
        cursor = result.nextCursor;
        const branchIdSet = new Set(branchIdsKey ? branchIdsKey.split("\u0000") : []);
        const incoming = result.events
          .filter((event) => {
            if (branchId) return event.branchId === branchId;
            return branchIdSet.size === 0 || branchIdSet.has(event.branchId);
          })
          .reverse();
        if (incoming.length === 0) return;
        setItems((current) => {
          const known = new Set(current.map((item) => item.transactionId));
          const next = incoming.filter((item) => !known.has(item.transactionId));
          return next.length > 0 ? [...next, ...current].slice(0, maxItems) : current;
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
  }, [branchId, branchIdsKey, liveCursor, maxItems]);

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
    <div>
      <RefundRecoveryPanel recovery={recovery} />
      {refundMessage ? (
        <p className="border-b border-border bg-surface-muted px-5 py-3 text-sm text-fg-muted">
          {refundMessage}
        </p>
      ) : null}
      <div className="divide-y divide-border">
        {items.map((payment) => (
        <div
          className="flex flex-col gap-3 px-5 py-4 transition hover:bg-surface-muted/60 sm:flex-row sm:items-center sm:justify-between"
          key={payment.transactionId}
        >
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={payment.studentName} />
            <div className="min-w-0">
              <p className="truncate text-body font-medium text-fg">{payment.studentName}</p>
              <p className="mt-0.5 truncate text-xs text-fg-subtle">{payment.studentNumber}</p>
              <p className="mt-0.5 truncate text-xs text-fg-subtle">
                {payment.branchName} / {formatDateTime(payment.completedAt)}
              </p>
              {payment.reference ? (
                <p className="mt-0.5 truncate font-mono text-xs text-fg-subtle">{payment.reference}</p>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-1 pl-12 text-left sm:items-end sm:pl-0 sm:text-right">
            <p className="text-lg font-semibold tabular-nums text-success-fg">
              {formatMoneyMinor(payment.amountMinor, payment.currency)}
            </p>
            {payment.totalRefundedMinor > 0 ? (
              <p className="text-xs text-warning-fg">
                Refunded {formatMoneyMinor(payment.totalRefundedMinor, payment.currency)}
              </p>
            ) : null}
            {payment.canRefund ? (
              <button
                className="mt-1 rounded-md border border-border px-3 py-1 text-xs font-medium text-fg-muted transition hover:border-border-strong hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
                disabled={recovery.blocked}
                onClick={() => setRefundPaymentToConfirm(payment)}
                type="button"
              >
                {recovery.state.busy ? "Refunding…" : "Refund"}
              </button>
            ) : (
              <p className="text-xs text-fg-subtle">
                {payment.refundStatus === "FULLY_REFUNDED"
                  ? "Fully refunded"
                  : guidance?.paymentsSuspended
                    ? "Refunds paused: payments suspended"
                    : "Refunds unavailable"}
              </p>
            )}
          </div>
        </div>
        ))}
        {items.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-fg-subtle">
            No wallet payments yet. New payments will appear here after students pay through your payment QR.
          </p>
        ) : null}
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
    </div>
  );
}
