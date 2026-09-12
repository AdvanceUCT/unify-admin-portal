/**
 * @fileoverview Renders completed student wallet payments for an approved vendor.
 * @module app/vendor/(portal)/payments/page
 */

import Link from "next/link";

import { Badge } from "@/components/ui/Badge";
import { LivePaymentList } from "@/features/vendors/LivePaymentList";
import { prisma } from "@/lib/db/prisma";
import { requireApprovedVendorContextForRender } from "@/lib/vendors/context";
import { encodeLivePaymentCursor, listRecentVendorPayments } from "@/lib/vendors/livePayments";
import { getVendorPayoutOverview } from "@/lib/vendors/payouts";

import { savePayoutDestinationAction } from "./actions";

function formatMoney(amountMinor: number, currency = "ZAR") {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency,
  }).format(amountMinor / 100);
}

function payoutStatusTone(status: string) {
  if (status === "COMPLETED") return "success" as const;
  if (status === "FAILED" || status === "REQUIRES_RECONCILIATION") return "danger" as const;
  return "warning" as const;
}

export default async function VendorPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string; payout?: string; payoutError?: string }>;
}) {
  const { context } = await requireApprovedVendorContextForRender();
  const params = await searchParams;
  const payoutOverview = context.role === "OWNER" ? await getVendorPayoutOverview(context) : null;
  const branches: Array<{ id: string; name: string }> = await prisma.vendorBranch.findMany({
    where: {
      vendorProfileId: context.vendorProfileId,
      id: { in: context.branchIds },
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const selectedBranchId = params.branchId && context.branchIds.includes(params.branchId)
    ? params.branchId
    : undefined;
  const selectedBranch = selectedBranchId
    ? branches.find((branch) => branch.id === selectedBranchId)
    : undefined;
  const payments = await listRecentVendorPayments(context, {
    branchIds: selectedBranchId ? [selectedBranchId] : undefined,
  });

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-surface p-5 shadow-md">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-page-title text-fg">Wallet payments</h1>
            <p className="mt-1 text-sm text-fg-subtle">
              Confirm student wallet payments before handing over goods or services.
            </p>
          </div>
          <Badge tone="success">Live polling</Badge>
        </div>
      </section>

      {branches.length > 1 ? (
        <section className="rounded-xl border border-border bg-surface p-4 shadow-md">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                !selectedBranchId ? "bg-brand-600 text-white" : "bg-surface-muted text-fg-muted hover:text-fg"
              }`}
              href="/vendor/payments"
            >
              All branches
            </Link>
            {branches.map((branch) => (
              <Link
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  selectedBranchId === branch.id ? "bg-brand-600 text-white" : "bg-surface-muted text-fg-muted hover:text-fg"
                }`}
                href={`/vendor/payments?branchId=${encodeURIComponent(branch.id)}`}
                key={branch.id}
              >
                {branch.name}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {payoutOverview ? (
        <section className="rounded-xl border border-border bg-surface p-5 shadow-md">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-section-title text-fg">Payouts</h2>
              <p className="mt-1 text-sm text-fg-subtle">
                Save the bank destination Paystack will use when settled wallet takings are paid out.
              </p>
            </div>
            <Badge tone={payoutOverview.hasDestination ? "success" : "warning"}>
              {payoutOverview.hasDestination ? "Destination saved" : "Destination required"}
            </Badge>
          </div>

          {params.payout === "updated" ? (
            <div className="mt-4 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
              Payout destination saved. Future payout runs will use the new Paystack recipient.
            </div>
          ) : null}
          {params.payoutError ? (
            <div className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
              {params.payoutError}
            </div>
          ) : null}

          <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr]">
            <form action={savePayoutDestinationAction} className="space-y-4 rounded-lg border border-border bg-surface-muted p-4">
              <div>
                <label className="text-sm font-medium text-fg" htmlFor="accountHolderName">
                  Account holder name
                </label>
                <input
                  className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg"
                  id="accountHolderName"
                  name="accountHolderName"
                  required
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-fg" htmlFor="bankCode">
                    Paystack bank code
                  </label>
                  <input
                    className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg"
                    id="bankCode"
                    name="bankCode"
                    placeholder="e.g. 250655"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-fg" htmlFor="bankName">
                    Bank name
                  </label>
                  <input
                    className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg"
                    id="bankName"
                    name="bankName"
                    placeholder="For display only"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-fg" htmlFor="accountNumber">
                  Account number
                </label>
                <input
                  autoComplete="off"
                  className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg"
                  id="accountNumber"
                  inputMode="numeric"
                  name="accountNumber"
                  required
                />
                <p className="mt-1 text-xs text-fg-subtle">
                  The raw number is sent to Paystack to create a transfer recipient and is not stored in plain text.
                </p>
              </div>
              <button
                className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
                type="submit"
              >
                Save payout destination
              </button>
            </form>

            <div className="space-y-4 rounded-lg border border-border bg-surface-muted p-4">
              <div>
                <p className="text-sm text-fg-subtle">Currently eligible for payout</p>
                <p className="mt-1 text-2xl font-semibold text-fg">
                  {formatMoney(payoutOverview.availableMinor)}
                </p>
                {payoutOverview.reservedPayoutMinor > 0 ? (
                  <p className="mt-1 text-xs text-fg-subtle">
                    {formatMoney(payoutOverview.reservedPayoutMinor)} is already reserved in pending/reconciliation payout batches.
                  </p>
                ) : null}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-fg">Recent payout batches</h3>
                {payoutOverview.recentBatches.length === 0 ? (
                  <p className="mt-2 text-sm text-fg-subtle">No payout batches have been created yet.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {payoutOverview.recentBatches.map((batch) => (
                      <div className="rounded-md border border-border bg-surface p-3" key={batch.id}>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-medium text-fg">{formatMoney(batch.amountMinor, batch.currency)}</span>
                          <Badge tone={payoutStatusTone(batch.status)}>{batch.status.replaceAll("_", " ")}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-fg-subtle">
                          Reference {batch.reference}
                          {batch.failureCode ? ` · ${batch.failureCode}` : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-section-title text-fg">Incoming payments</h2>
            <p className="mt-1 text-sm text-fg-subtle">
              {selectedBranch ? selectedBranch.name : "All permitted branches"}
            </p>
          </div>
          <span className="text-xs font-medium text-fg-subtle">Refreshes every few seconds</span>
        </div>
        <LivePaymentList
          branchId={selectedBranchId}
          initialItems={payments}
          liveCursor={encodeLivePaymentCursor({ completedAt: new Date().toISOString(), id: "_" })}
        />
      </section>
    </div>
  );
}
