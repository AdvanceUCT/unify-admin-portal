/**
 * @fileoverview Renders the owner-only wallet top-up form at `/vendor/payments/top-up` (spec §9.3).
 * @module app/vendor/(portal)/payments/top-up/page
 */

import { randomUUID } from "node:crypto";

import Link from "next/link";

import { BackButton } from "@/components/ui/BackButton";
import { env } from "@/lib/config/env";
import { formatAcademicDateTime, formatMoneyMinor } from "@/lib/formatters";
import { requireVendorOwnerContextForRender } from "@/lib/vendors/context";
import { getVendorPayoutOverview } from "@/lib/vendors/payouts";
import { getUnresolvedVendorWalletTopup } from "@/lib/vendors/walletTopups";
import { startVendorTopupAction } from "../actions";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function minorToRandInput(amountMinor: number) {
  return (amountMinor / 100).toFixed(2);
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-md">
      <div className="text-sm leading-6 text-fg-muted">{children}</div>
      <Link className="mt-4 inline-block text-sm font-medium text-brand-700 hover:underline" href="/vendor/payments">
        Back to payments →
      </Link>
    </section>
  );
}

export default async function VendorWalletTopUpPage({
  searchParams,
}: {
  searchParams: Promise<{ topUpError?: string | string[] }>;
}) {
  const { context } = await requireVendorOwnerContextForRender();
  const topUpError = firstParam((await searchParams).topUpError);
  const [overview, inProgress] = await Promise.all([
    getVendorPayoutOverview(context),
    getUnresolvedVendorWalletTopup(context.vendorProfileId),
  ]);
  const currency = overview.walletCurrency;

  let content: React.ReactNode;
  if (!env.PAYMENT_WALLET_TOPUPS_ENABLED) {
    content = <Notice>Wallet top-ups are currently unavailable. Contact the university for help.</Notice>;
  } else if (inProgress) {
    const returnHref = `/vendor/payments/top-up/return?topUpId=${encodeURIComponent(inProgress.topUpId)}`;
    content = (
      <section className="rounded-xl border border-border bg-surface p-5 shadow-md">
        <h2 className="text-section-title text-fg">Top-up in progress</h2>
        <p className="mt-2 text-sm leading-6 text-fg-muted">
          A top-up of {formatMoneyMinor(inProgress.amountMinor, currency)} has not been confirmed yet. Finish paying on
          Paystack, or check its status. You can start a new top-up once this one is resolved.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {inProgress.authorizationUrl ? (
            <a
              className="inline-flex h-9 items-center rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700"
              href={inProgress.authorizationUrl}
            >
              Continue to Paystack
            </a>
          ) : null}
          <Link
            className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-medium text-fg hover:bg-surface-muted"
            href={returnHref}
          >
            Check status
          </Link>
        </div>
      </section>
    );
  } else if (!overview.overdraft) {
    content = <Notice>Your wallet balance is not negative, so there is nothing to top up.</Notice>;
  } else if (!overview.canTopUp) {
    content = <Notice>Wallet top-ups are not available while payments are suspended for this reason. Contact the university for help.</Notice>;
  } else {
    const { deficitMinor, negativeSince, suspendAt } = overview.overdraft;
    const minimumMinor = Math.min(env.PAYMENT_TOPUP_MIN_MINOR, deficitMinor);
    content = (
      <section className="rounded-xl border border-border bg-surface p-5 shadow-md">
        <dl className="grid gap-2 rounded-lg border border-border bg-surface-muted p-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-fg-subtle">Wallet balance</dt>
            <dd className="font-medium tabular-nums text-danger-fg">
              {formatMoneyMinor(overview.walletBalanceMinor, currency)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-fg-subtle">Negative since</dt>
            <dd className="font-medium text-fg">{formatAcademicDateTime(negativeSince)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-fg-subtle">{overview.suspension ? "Payments" : "Suspension on"}</dt>
            <dd className="font-medium text-fg">
              {overview.suspension ? "Suspended" : formatAcademicDateTime(suspendAt)}
            </dd>
          </div>
        </dl>

        {topUpError ? (
          <div className="mt-4 rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger-fg">
            {topUpError}
          </div>
        ) : null}

        <form action={startVendorTopupAction} className="mt-4 space-y-4">
          <input name="idempotencyKey" type="hidden" value={randomUUID()} />
          <label className="block text-sm">
            <span className="font-medium text-fg-muted">Top-up amount (ZAR)</span>
            <input
              className="mt-1.5 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm tabular-nums text-fg"
              defaultValue={minorToRandInput(deficitMinor)}
              max={minorToRandInput(deficitMinor)}
              min={minorToRandInput(minimumMinor)}
              name="amount"
              required
              step="0.01"
              type="number"
            />
            <span className="mt-1.5 block text-xs text-fg-subtle">
              Between {formatMoneyMinor(minimumMinor, currency)} and {formatMoneyMinor(deficitMinor, currency)}. Topping
              up the full deficit {overview.suspension ? "restores payments and refunds immediately" : "clears the overdraft"}.
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button
              className="inline-flex h-10 items-center rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700"
              type="submit"
            >
              Continue to Paystack
            </button>
            <p className="text-xs text-fg-subtle">You will pay on Paystack&apos;s secure test checkout.</p>
          </div>
        </form>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <BackButton href="/vendor/payments" label="Back to payments" />

      <section className="rounded-xl border border-border bg-surface p-5 shadow-md">
        <h1 className="text-page-title text-fg">Top up wallet</h1>
        <p className="mt-1 text-sm text-fg-subtle">
          Pay down a negative wallet balance with a card payment. Top-ups are only available while your balance is
          negative and can&apos;t exceed the amount you owe.
        </p>
      </section>

      {content}
    </div>
  );
}
