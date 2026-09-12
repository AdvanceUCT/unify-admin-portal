/**
 * @fileoverview Shows recent student wallet payments across permitted vendor branches.
 * @module features/vendors/LivePaymentList
 */

"use client";

import { useEffect, useRef, useState } from "react";

import { Avatar } from "@/components/ui/Avatar";
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
  refundableUntil?: string;
  totalRefundedMinor: number;
  remainingRefundableMinor: number;
  refundStatus: "REFUNDABLE" | "EXPIRED" | "FULLY_REFUNDED";
};

type RefundResponse = {
  originalTransactionId: string;
  refundTransactionId: string;
  refundedAmountMinor: number;
  totalRefundedMinor: number;
  remainingRefundableMinor: number;
  refundStatus: LivePaymentEvent["refundStatus"];
  refundableUntil?: string;
};

function parseRefundAmountMinor(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const [rand, cents = ""] = normalized.split(".");
  const amountMinor = Number(rand) * 100 + Number(cents.padEnd(2, "0"));
  return Number.isSafeInteger(amountMinor) && amountMinor > 0 ? amountMinor : null;
}

async function parseErrorMessage(response: Response) {
  try {
    const body = await response.json() as { error?: { message?: string } };
    return body.error?.message ?? "Refund could not be completed.";
  } catch {
    return "Refund could not be completed.";
  }
}

export function LivePaymentList({
  branchId,
  initialItems,
  liveCursor,
}: {
  branchId?: string;
  initialItems: LivePaymentEvent[];
  liveCursor?: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [refundMessage, setRefundMessage] = useState<string>();
  const [refundingTransactionId, setRefundingTransactionId] = useState<string>();
  const itemsRef = useRef(initialItems);

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
        if (branchId) params.set("branchId", branchId);
        const response = await fetch(`/api/vendor/live-payments?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const result = await response.json() as { events: LivePaymentEvent[]; nextCursor: string };
        if (cancelled) return;
        cursor = result.nextCursor;
        const incoming = result.events
          .filter((event) => !branchId || event.branchId === branchId)
          .reverse();
        if (incoming.length === 0) return;
        setItems((current) => {
          const known = new Set(current.map((item) => item.transactionId));
          const next = incoming.filter((item) => !known.has(item.transactionId));
          return next.length > 0 ? [...next, ...current].slice(0, 20) : current;
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
  }, [branchId, liveCursor]);

  async function refundPayment(payment: LivePaymentEvent) {
    if (payment.refundStatus !== "REFUNDABLE") return;
    setRefundMessage(undefined);
    const amountText = window.prompt(
      `Refund amount for ${payment.studentName}. Maximum ${formatMoneyMinor(payment.remainingRefundableMinor, payment.currency)}.`,
      (payment.remainingRefundableMinor / 100).toFixed(2),
    );
    if (amountText === null) return;
    const amountMinor = parseRefundAmountMinor(amountText);
    if (!amountMinor || amountMinor > payment.remainingRefundableMinor) {
      setRefundMessage("Enter a valid refund amount that is not more than the remaining refundable amount.");
      return;
    }
    const confirmed = window.confirm(
      `Refund ${formatMoneyMinor(amountMinor, payment.currency)} to ${payment.studentName} for ${payment.branchName}?`,
    );
    if (!confirmed) return;

    setRefundingTransactionId(payment.transactionId);
    try {
      const response = await fetch(`/api/vendor/payments/${encodeURIComponent(payment.transactionId)}/refund`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amountMinor,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      if (!response.ok) throw new Error(await parseErrorMessage(response));
      const result = await response.json() as RefundResponse;
      setItems((current) => current.map((item) => (
        item.transactionId === result.originalTransactionId
          ? {
              ...item,
              totalRefundedMinor: result.totalRefundedMinor,
              remainingRefundableMinor: result.remainingRefundableMinor,
              refundStatus: result.refundStatus,
              refundableUntil: result.refundableUntil ?? item.refundableUntil,
            }
          : item
      )));
      setRefundMessage(`Refunded ${formatMoneyMinor(result.refundedAmountMinor, payment.currency)}.`);
    } catch (error) {
      setRefundMessage(error instanceof Error ? error.message : "Refund could not be completed.");
    } finally {
      setRefundingTransactionId(undefined);
    }
  }

  return (
    <div>
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
            {payment.refundableUntil ? (
              <p className="text-xs text-fg-subtle">Refundable until {formatDateTime(payment.refundableUntil)}</p>
            ) : null}
            {payment.refundStatus === "REFUNDABLE" ? (
              <button
                className="mt-1 rounded-md border border-border px-3 py-1 text-xs font-medium text-fg-muted transition hover:border-border-strong hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
                disabled={refundingTransactionId === payment.transactionId}
                onClick={() => void refundPayment(payment)}
                type="button"
              >
                {refundingTransactionId === payment.transactionId ? "Refunding…" : "Refund"}
              </button>
            ) : (
              <p className="text-xs text-fg-subtle">
                {payment.refundStatus === "FULLY_REFUNDED" ? "Fully refunded" : "Refund window closed"}
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
    </div>
  );
}
