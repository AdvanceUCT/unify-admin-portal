/**
 * @fileoverview Confirmation dialog for full or partial wallet payment refunds.
 * @module features/vendors/RefundPaymentDialog
 */

"use client";

import { AlertTriangle } from "lucide-react";
import { useState } from "react";

import { Dialog } from "@/components/ui/Dialog";
import { formatMoneyMinor } from "@/lib/formatters";
import type { LivePaymentEvent } from "@/features/vendors/LivePaymentList";

/** Vendor wallet state the dialog needs to warn before a refund overdraws the wallet. */
export type RefundGuidance = {
  walletBalanceMinor: number;
  overdraftSuspensionDays: number;
  paymentsSuspended: boolean;
};

const RAND_AMOUNT_PATTERN = /^\d+(?:\.\d{1,2})?$/;

function randToMinor(value: string) {
  const trimmed = value.trim();
  if (!RAND_AMOUNT_PATTERN.test(trimmed)) return null;
  const amountMinor = Math.round(Number(trimmed) * 100);
  return Number.isSafeInteger(amountMinor) ? amountMinor : null;
}

function minorToRandInput(amountMinor: number) {
  return (amountMinor / 100).toFixed(2);
}

function RefundForm({
  guidance,
  isPending,
  onClose,
  onConfirm,
  payment,
}: {
  guidance?: RefundGuidance;
  isPending: boolean;
  onClose: () => void;
  onConfirm: (amountMinor: number) => void;
  payment: LivePaymentEvent;
}) {
  const [amountInput, setAmountInput] = useState(minorToRandInput(payment.remainingRefundableMinor));
  const amountMinor = randToMinor(amountInput);
  const amountError =
    amountMinor === null || amountMinor <= 0
      ? "Enter an amount in rand, for example 12.50."
      : amountMinor > payment.remainingRefundableMinor
        ? `You can refund at most ${formatMoneyMinor(payment.remainingRefundableMinor, payment.currency)}.`
        : null;
  const overdraftMinor =
    guidance && amountMinor !== null && !amountError
      ? amountMinor - Math.max(guidance.walletBalanceMinor, 0)
      : 0;
  const isFullRefund = amountMinor === payment.remainingRefundableMinor;

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (amountMinor !== null && !amountError) onConfirm(amountMinor);
      }}
    >
      <p>
        Refund {payment.studentName} to their student wallet. You can refund the full remaining amount or part of it.
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
          <dt className="text-fg-subtle">Original</dt>
          <dd className="font-medium tabular-nums text-fg">
            {formatMoneyMinor(payment.amountMinor, payment.currency)}
          </dd>
        </div>
        <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
          <dt className="text-fg-subtle">Refunded</dt>
          <dd className="font-medium tabular-nums text-fg">
            {formatMoneyMinor(payment.totalRefundedMinor, payment.currency)}
          </dd>
        </div>
        <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
          <dt className="text-fg-subtle">Remaining</dt>
          <dd className="font-medium tabular-nums text-fg">
            {formatMoneyMinor(payment.remainingRefundableMinor, payment.currency)}
          </dd>
        </div>
      </dl>

      <label className="block text-sm">
        <span className="font-medium text-fg-muted">Refund amount (ZAR)</span>
        <input
          aria-invalid={Boolean(amountError)}
          className="mt-1.5 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm tabular-nums text-fg"
          disabled={isPending}
          inputMode="decimal"
          onChange={(event) => setAmountInput(event.target.value)}
          value={amountInput}
        />
        {amountError ? <span className="mt-1.5 block text-xs text-danger-fg">{amountError}</span> : null}
      </label>

      {guidance && overdraftMinor > 0 ? (
        <div className="flex items-start gap-2 rounded-lg border border-warning-border bg-warning-bg px-3 py-2 text-sm text-warning-fg">
          <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0" size={16} />
          <p>
            This refund will put your wallet into overdraft by {formatMoneyMinor(overdraftMinor, payment.currency)}.
            Payouts pause while your balance is negative, and payments are suspended if it stays negative for{" "}
            {guidance.overdraftSuspensionDays} {guidance.overdraftSuspensionDays === 1 ? "day" : "days"}.
          </p>
        </div>
      ) : null}

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
          disabled={isPending || Boolean(amountError)}
          type="submit"
        >
          {isPending ? "Refunding..." : isFullRefund ? "Confirm full refund" : "Confirm refund"}
        </button>
      </div>
    </form>
  );
}

export function RefundPaymentDialog({
  guidance,
  isPending,
  onClose,
  onConfirm,
  payment,
}: {
  guidance?: RefundGuidance;
  isPending: boolean;
  onClose: () => void;
  onConfirm: (amountMinor: number) => void;
  payment: LivePaymentEvent | null;
}) {
  return (
    <Dialog
      isOpen={payment !== null}
      onClose={isPending ? () => undefined : onClose}
      title="Refund payment"
    >
      {payment ? (
        <RefundForm
          guidance={guidance}
          isPending={isPending}
          key={payment.transactionId}
          onClose={onClose}
          onConfirm={onConfirm}
          payment={payment}
        />
      ) : null}
    </Dialog>
  );
}
