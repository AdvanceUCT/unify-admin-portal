/**
 * @fileoverview Wallet balance summary for the vendor payments page.
 * @module app/vendor/(portal)/payments/VendorWalletBalanceCard
 */

import { AlertTriangle, ArrowUpRight, CheckCircle2, WalletCards } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/Badge";
import { formatMoneyMinor } from "@/lib/formatters";
import type { getVendorPayoutOverview } from "@/lib/vendors/payouts";
import { RunPayoutButton } from "./RunPayoutButton";

type PayoutOverview = Awaited<ReturnType<typeof getVendorPayoutOverview>>;

export function VendorWalletBalanceCard({
  canRunDemoPayout,
  overview,
}: {
  canRunDemoPayout: boolean;
  overview: PayoutOverview;
}) {
  const isNegative = overview.walletBalanceMinor < 0;
  const threshold = formatMoneyMinor(overview.thresholdMinor, overview.walletCurrency);
  const thresholdReached = overview.amountToThresholdMinor <= 0;
  const thresholdProgress =
    overview.thresholdMinor > 0
      ? Math.min(100, Math.max(0, (overview.availableMinor / overview.thresholdMinor) * 100))
      : 100;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
      <div className="grid gap-0 lg:grid-cols-[1.25fr_0.9fr]">
        <div className="p-6 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-fg-muted">
                <WalletCards aria-hidden="true" size={17} />
                <span>Wallet balance</span>
              </div>
              <p className={`mt-4 text-4xl font-semibold leading-none sm:text-5xl ${isNegative ? "text-danger-fg" : "text-fg"}`}>
                {formatMoneyMinor(overview.walletBalanceMinor, overview.walletCurrency)}
              </p>
            </div>
            <Link
              className="inline-flex items-center gap-1.5 rounded-md bg-surface-muted px-3 py-2 text-sm font-medium text-fg-muted transition hover:bg-brand-50 hover:text-brand-700"
              href="/vendor/payments/payouts"
            >
              Payout history
              <ArrowUpRight aria-hidden="true" size={15} />
            </Link>
          </div>

          <p className="mt-4 max-w-xl text-sm text-fg-subtle">
            Student wallet payments collected by your approved branches.
          </p>
          {/* While negative or suspended, the status alert above the card explains the pause. */}
          {isNegative || overview.suspension ? null : (
            <div className="mt-5 max-w-sm">
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="font-medium text-fg-muted">
                  {thresholdReached ? "Paid out tonight" : "Next payout"}
                </span>
                <span className="text-fg-subtle">
                  {thresholdReached
                    ? formatMoneyMinor(overview.availableMinor, overview.walletCurrency)
                    : `${formatMoneyMinor(overview.amountToThresholdMinor, overview.walletCurrency)} to go`}
                </span>
              </div>
              <div
                aria-label={`Payout threshold progress: ${threshold}`}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={Math.round(thresholdProgress)}
                className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-muted"
                role="progressbar"
              >
                <div
                  className={`h-full rounded-full transition-[width] ${thresholdReached ? "bg-success-fg" : "bg-brand-600"}`}
                  style={{ width: `${thresholdProgress}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs text-fg-subtle">Automatic nightly payout at {threshold}</p>
            </div>
          )}
          {overview.reservedPayoutMinor > 0 ? (
            <p className="mt-1 max-w-xl text-xs text-fg-subtle">
              {formatMoneyMinor(overview.reservedPayoutMinor, overview.walletCurrency)} in payouts already in progress.
            </p>
          ) : null}
        </div>

        <div className="flex flex-col justify-center border-t border-border p-6 sm:p-7 lg:border-l lg:border-t-0">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${overview.hasDestination ? "bg-success-bg text-success-fg" : "bg-warning-bg text-warning-fg"}`}>
                {overview.hasDestination ? (
                  <CheckCircle2 aria-hidden="true" size={19} />
                ) : (
                  <AlertTriangle aria-hidden="true" size={19} />
                )}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-fg">Payout destination</p>
                <p className="mt-0.5 text-xs text-fg-subtle">
                  {overview.hasDestination ? "Saved and ready for payout runs" : "Required before payouts can run"}
                </p>
              </div>
            </div>
            <Badge tone={overview.hasDestination ? "success" : "warning"}>
              {overview.hasDestination ? "Saved" : "Required"}
            </Badge>
          </div>

          {canRunDemoPayout ? (
            <div className="mt-6">
              <RunPayoutButton
                availableMinor={overview.availableMinor}
                compact
                embedded
                hasDestination={overview.hasDestination}
                paymentsSuspended={overview.suspension !== null}
                thresholdMinor={overview.thresholdMinor}
              />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
