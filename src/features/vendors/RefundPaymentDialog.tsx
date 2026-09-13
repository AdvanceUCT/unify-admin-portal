/**
 * @fileoverview Confirmation dialog for full-amount wallet payment refunds.
 * @module features/vendors/RefundPaymentDialog
 */

"use client";

import { Dialog } from "@/components/ui/Dialog";
import { formatDateTime, formatMoneyMinor } from "@/lib/formatters";
import type { LivePaymentEvent } from "@/features/vendors/LivePaymentList";

export function RefundPaymentDialog({
  isPending,
  onClose,
  onConfirm,
  payment,
}: {
  isPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
  payment: LivePaymentEvent | null;
}) {
  return (
    <Dialog
      isOpen={payment !== null}
      onClose={isPending ? () => undefined : onClose}
      title="Refund payment"
    >
      {payment ? (
        <div className="space-y-4">
          <p>
            Refund the full remaining amount of{" "}
            <span className="font-semibold text-fg">
              {formatMoneyMinor(payment.remainingRefundableMinor, payment.currency)}
            </span>{" "}
            to {payment.studentName}?
          </p>
          <dl className="grid gap-2 rounded-lg border border-border bg-surface-muted p-3 text-sm">
            <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
              <dt className="text-fg-subtle">Branch</dt>
              <dd className="truncate font-medium text-fg">{payment.branchName}</dd>
            </div>
            <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
              <dt className="text-fg-subtle">Student</dt>
              <dd className="truncate font-medium text-fg">{payment.studentName}</dd>
            </div>
            <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
              <dt className="text-fg-subtle">Paid</dt>
              <dd className="font-medium tabular-nums text-fg">
                {formatMoneyMinor(payment.amountMinor, payment.currency)}
              </dd>
            </div>
            {payment.totalRefundedMinor > 0 ? (
              <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
                <dt className="text-fg-subtle">Refunded</dt>
                <dd className="font-medium tabular-nums text-fg">
                  {formatMoneyMinor(payment.totalRefundedMinor, payment.currency)}
                </dd>
              </div>
            ) : null}
            {payment.refundableUntil ? (
              <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
                <dt className="text-fg-subtle">Window</dt>
                <dd className="truncate font-medium text-fg">{formatDateTime(payment.refundableUntil)}</dd>
              </div>
            ) : null}
          </dl>
          <div className="flex justify-end gap-2 pt-1">
            <button
              className="rounded-md bg-surface-muted px-3 py-2 text-sm font-medium text-fg-muted transition hover:bg-brand-50 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isPending}
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded-md bg-danger-fg px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isPending}
              onClick={onConfirm}
              type="button"
            >
              {isPending ? "Refunding..." : "Confirm full refund"}
            </button>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
