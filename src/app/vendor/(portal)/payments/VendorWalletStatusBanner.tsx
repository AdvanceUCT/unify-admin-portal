/**
 * @fileoverview Overdraft panel and payment-suspension banner for the vendor payments page (spec §9.2).
 * @module app/vendor/(portal)/payments/VendorWalletStatusBanner
 */

import { AlertTriangle, ShieldAlert } from "lucide-react";
import Link from "next/link";

import { formatAcademicDateTime, formatMoneyMinor } from "@/lib/formatters";
import type { getVendorPayoutOverview } from "@/lib/vendors/payouts";

type PayoutOverview = Awaited<ReturnType<typeof getVendorPayoutOverview>>;

function TopUpLink({ deficitMinor, currency }: { deficitMinor: number; currency: string }) {
  return (
    <Link
      className="inline-flex h-9 shrink-0 items-center rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700"
      href="/vendor/payments/top-up"
    >
      Top up {formatMoneyMinor(deficitMinor, currency)}
    </Link>
  );
}

/** Renders nothing while the wallet is in good standing. Staff see the panel without the top-up button. */
export function VendorWalletStatusBanner({ overview }: { overview: PayoutOverview }) {
  const { overdraft, suspension, walletCurrency } = overview;

  if (suspension) {
    const overdraftSuspension = suspension.code === "OVERDRAFT";
    return (
      <section className="rounded-xl border border-danger-border bg-danger-bg p-5 shadow-md">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <ShieldAlert aria-hidden="true" className="mt-0.5 shrink-0 text-danger-fg" size={20} />
            <div className="min-w-0">
              <h2 className="text-section-title text-fg">
                {overdraftSuspension && overdraft
                  ? `Payments suspended — wallet overdrawn by ${formatMoneyMinor(overdraft.deficitMinor, walletCurrency)}`
                  : "Payments suspended"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-danger-fg">
                {overdraftSuspension
                  ? "New sales, refunds and payouts are paused. Top up to restore payments and refunds."
                  : suspension.reason ?? "Contact the university to restore wallet payments."}
              </p>
              {suspension.suspendedAt ? (
                <p className="mt-1 text-xs text-danger-fg">
                  Suspended {formatAcademicDateTime(suspension.suspendedAt)}
                </p>
              ) : null}
            </div>
          </div>
          {overview.canTopUp && overdraft ? (
            <TopUpLink currency={walletCurrency} deficitMinor={overdraft.deficitMinor} />
          ) : null}
        </div>
      </section>
    );
  }

  if (!overdraft) return null;

  return (
    <section className="rounded-xl border border-warning-border bg-warning-bg p-5 shadow-md">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0 text-warning-fg" size={20} />
          <div className="min-w-0">
            <h2 className="text-section-title text-fg">
              Wallet overdrawn by {formatMoneyMinor(overdraft.deficitMinor, walletCurrency)}
            </h2>
            <p className="mt-2 text-sm leading-6 text-warning-fg">
              Payouts are paused while your balance is negative. New sales pay the deficit down automatically.
            </p>
            <p className="mt-1 text-sm leading-6 text-warning-fg">
              Payments will be suspended on {formatAcademicDateTime(overdraft.suspendAt)} unless your balance recovers.
            </p>
            <p className="mt-1 text-xs text-warning-fg">
              Negative since {formatAcademicDateTime(overdraft.negativeSince)}
            </p>
          </div>
        </div>
        {overview.canTopUp ? (
          <TopUpLink currency={walletCurrency} deficitMinor={overdraft.deficitMinor} />
        ) : null}
      </div>
    </section>
  );
}
