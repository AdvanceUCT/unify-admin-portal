/**
 * @fileoverview Renders the live-updating payments table used by `/vendor/payments`.
 * @module app/vendor/(portal)/payments/LivePaymentTable
 */

"use client";

import { useEffect, useMemo, useState } from "react";

import { StatusText, type StatusTone } from "@/components/ui/StatusText";
import { formatDateTime, formatMoneyMinor } from "@/lib/formatters";
import type { LivePaymentEvent } from "@/features/vendors/LivePaymentList";
import type { VendorPaymentEventFilters } from "@/lib/vendors/livePayments";

type RefundResponse = {
  originalTransactionId: string;
  refundTransactionId: string;
  refundedAmountMinor: number;
  totalRefundedMinor: number;
  remainingRefundableMinor: number;
  refundStatus: LivePaymentEvent["refundStatus"];
  refundableUntil?: string;
};

const REFUND_STATUS_LABEL: Record<LivePaymentEvent["refundStatus"], string> = {
  REFUNDABLE: "Refundable",
  EXPIRED: "Window closed",
  FULLY_REFUNDED: "Fully refunded",
};

const REFUND_STATUS_TONE: Record<LivePaymentEvent["refundStatus"], StatusTone> = {
  REFUNDABLE: "success",
  EXPIRED: "neutral",
  FULLY_REFUNDED: "warning",
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

function dateWithinFilter(value: string, filters: VendorPaymentEventFilters) {
  if (!filters.dateFrom && !filters.dateTo) return true;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return false;
  if (filters.dateFrom && time < Date.parse(`${filters.dateFrom}T00:00:00.000`)) return false;
  if (filters.dateTo && time > Date.parse(`${filters.dateTo}T23:59:59.999`)) return false;
  return true;
}

function matchesFilters(payment: LivePaymentEvent, filters: VendorPaymentEventFilters) {
  if (filters.branchId && payment.branchId !== filters.branchId) return false;
  if (filters.refundStatus && payment.refundStatus !== filters.refundStatus) return false;
  if (!dateWithinFilter(payment.completedAt, filters)) return false;

  const query = filters.query?.trim().toLowerCase();
  if (!query) return true;
  return [
    payment.studentName,
    payment.studentNumber,
    payment.branchName,
    payment.reference,
    payment.transactionId,
  ].some((value) => value?.toLowerCase().includes(query));
}

export function LivePaymentTable({
  filters,
  initialItems,
  liveCursor,
}: {
  filters: VendorPaymentEventFilters;
  initialItems: LivePaymentEvent[];
  liveCursor?: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [refundMessage, setRefundMessage] = useState<string>();
  const [refundingTransactionId, setRefundingTransactionId] = useState<string>();
  const filtersKey = useMemo(() => JSON.stringify(filters), [filters]);

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
    <>
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
            {items.map((payment) => (
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
                  {payment.refundableUntil && payment.refundStatus === "REFUNDABLE" ? (
                    <p className="mt-1 text-xs text-fg-subtle">Until {formatDateTime(payment.refundableUntil)}</p>
                  ) : null}
                </td>
                <td className="max-w-44 truncate px-4 py-3 font-mono text-xs text-fg-muted">
                  {payment.reference ?? payment.transactionId}
                </td>
                <td className="px-4 py-3">
                  {payment.refundStatus === "REFUNDABLE" ? (
                    <button
                      className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-fg-muted transition hover:border-border-strong hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={refundingTransactionId === payment.transactionId}
                      onClick={() => void refundPayment(payment)}
                      type="button"
                    >
                      {refundingTransactionId === payment.transactionId ? "Refunding..." : "Refund"}
                    </button>
                  ) : (
                    <span className="text-xs text-fg-subtle">No action</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-fg-subtle">
            No wallet payments match these filters.
          </p>
        )}
      </div>
    </>
  );
}
