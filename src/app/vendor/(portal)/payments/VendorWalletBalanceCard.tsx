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
              <p className="mt-4 text-4xl font-semibold leading-none text-fg sm:text-5xl">
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
              />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
