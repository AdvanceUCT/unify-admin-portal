/**
 * @fileoverview Renders the authenticated administrator page at `/payments`.
 * @module app/(admin)/payments/page
 */

import Link from "next/link";
import { Wallet } from "lucide-react";

import { Metric } from "@/components/ui/Metric";
import { formatCurrency } from "@/lib/formatters";
import { requireRole } from "@/lib/auth/session";
import { getVendorPayoutSummaries } from "@/lib/payments/payouts";
import { getUniversityProfile } from "@/lib/university/profile";

function payoutDate(value: Date | null) {
  if (!value) return "Never";
  return value.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default async function PaymentsPage() {
  await requireRole(["SUPER_ADMIN", "ADMIN"]);

  const profile = await getUniversityProfile();

  if (!profile?.paymentServicesEnabled) {
    return (
      <div className="space-y-6">
        <section className="flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50 p-5">
          <Wallet className="mt-0.5 shrink-0 text-brand-700" size={20} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-brand-700">Payment services aren&apos;t enabled yet</p>
            <p className="mt-1 text-sm text-brand-700">
              Students pre-load a UNIFY wallet and spend it with approved on-campus vendors, with
              funds settling to your university&apos;s own Paystack account. Enabling it means your
              university takes on real payout and safeguarding responsibilities.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Link
                className="inline-flex h-9 items-center rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700"
                href="/settings"
              >
                Set up payment services
              </Link>
              <Link
                className="inline-flex h-9 items-center rounded-md border border-border bg-surface px-4 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg"
                href="/payments/about"
              >
                Learn how this works
              </Link>
            </div>
          </div>
        </section>
      </div>
    );
  }

  const payoutSummaries = await getVendorPayoutSummaries();
  const totalOwed = payoutSummaries.reduce((sum, entry) => sum + entry.accruedSinceLastPayout, 0);
  const hasPayoutData = payoutSummaries.length > 0;

  return (
    <div className="space-y-6">
      <Metric
        detail={hasPayoutData ? `Across ${payoutSummaries.length} vendors` : "Payout reporting isn't available yet"}
        label="Total owed to vendors"
        tone="brand"
        value={hasPayoutData ? formatCurrency(totalOwed) : "—"}
      />

      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-section-title text-fg">Vendor payouts</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-body">
            <thead className="border-b border-border">
              <tr className="whitespace-nowrap text-caption uppercase tracking-wide text-fg-subtle">
                <th className="px-5 py-3 font-medium">Vendor</th>
                <th className="px-5 py-3 font-medium">Accrued since last payout</th>
                <th className="px-5 py-3 font-medium">Last payout date</th>
                <th className="px-5 py-3 font-medium">Last payout amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {!hasPayoutData ? (
                <tr>
                  <td className="px-5 py-10 text-center text-fg-subtle" colSpan={4}>
                    No payout data yet &mdash; wallet transaction reporting isn&apos;t available in
                    this build.
                  </td>
                </tr>
              ) : (
                payoutSummaries.map((entry) => (
                  <tr className="transition hover:bg-surface-muted/60" key={entry.vendorProfileId}>
                    <td className="px-5 py-4 font-medium text-fg">{entry.companyName}</td>
                    <td className="px-5 py-4 tabular-nums text-fg-muted">
                      {formatCurrency(entry.accruedSinceLastPayout)}
                    </td>
                    <td className="px-5 py-4 tabular-nums text-fg-muted">
                      {payoutDate(entry.lastPayoutDate)}
                    </td>
                    <td className="px-5 py-4 tabular-nums text-fg-muted">
                      {entry.lastPayoutAmount === null ? "—" : formatCurrency(entry.lastPayoutAmount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
