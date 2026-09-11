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
};

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

  return (
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
            {payment.refundableUntil ? (
              <p className="text-xs text-fg-subtle">Refundable until {formatDateTime(payment.refundableUntil)}</p>
            ) : null}
          </div>
        </div>
      ))}
      {items.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-fg-subtle">
          No wallet payments yet. New payments will appear here after students pay through your payment QR.
        </p>
      ) : null}
    </div>
  );
}
