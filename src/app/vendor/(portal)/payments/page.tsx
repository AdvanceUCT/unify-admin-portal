/**
 * @fileoverview Renders completed student wallet payments for an approved vendor.
 * @module app/vendor/(portal)/payments/page
 */

import Link from "next/link";

import { Badge } from "@/components/ui/Badge";
import { prisma } from "@/lib/db/prisma";
import { requireApprovedVendorContextForRender } from "@/lib/vendors/context";
import {
  encodeLivePaymentCursor,
  listVendorPaymentEvents,
  type VendorPaymentEventFilters,
} from "@/lib/vendors/livePayments";
import { getVendorPayoutOverview } from "@/lib/vendors/payouts";
import { ExportCsvButton } from "../verifications/ExportCsvButton";
import { LivePaymentTable } from "./LivePaymentTable";

import { savePayoutDestinationAction } from "./actions";
import { VendorPaymentsFilterBar } from "./VendorPaymentsFilterBar";

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

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function pageParam(value: string | string[] | undefined) {
  const page = Number(firstParam(value));
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function refundStatusParam(value: string | string[] | undefined): VendorPaymentEventFilters["refundStatus"] {
  const status = firstParam(value);
  return status === "REFUNDABLE" || status === "EXPIRED" || status === "FULLY_REFUNDED"
    ? status
    : undefined;
}

function pageHref(filters: VendorPaymentEventFilters, page: number) {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.refundStatus) params.set("refundStatus", filters.refundStatus);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.branchId) params.set("branchId", filters.branchId);
  params.set("page", String(page));
  return `/vendor/payments?${params.toString()}`;
}

function exportHref(filters: VendorPaymentEventFilters) {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.refundStatus) params.set("refundStatus", filters.refundStatus);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.branchId) params.set("branchId", filters.branchId);
  const query = params.toString();
  return `/api/vendor/payments/export${query ? `?${query}` : ""}`;
}

export default async function VendorPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    branchId?: string | string[];
    dateFrom?: string | string[];
    dateTo?: string | string[];
    page?: string | string[];
    payout?: string | string[];
    payoutError?: string | string[];
    q?: string | string[];
    refundStatus?: string | string[];
  }>;
}) {
  const { context } = await requireApprovedVendorContextForRender();
  const params = await searchParams;
  const branches: Array<{ id: string; name: string }> = await prisma.vendorBranch.findMany({
    where: {
      vendorProfileId: context.vendorProfileId,
      id: { in: context.branchIds },
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const branchId = firstParam(params.branchId);
  const selectedBranchId = branchId && context.branchIds.includes(branchId)
    ? branchId
    : undefined;
  const filters: VendorPaymentEventFilters = {
    branchId: selectedBranchId,
    dateFrom: firstParam(params.dateFrom),
    dateTo: firstParam(params.dateTo),
    page: pageParam(params.page),
    query: firstParam(params.q),
    refundStatus: refundStatusParam(params.refundStatus),
  };
  const [payoutOverview, result] = await Promise.all([
    context.role === "OWNER" ? getVendorPayoutOverview(context) : null,
    listVendorPaymentEvents(context, filters),
  ]);
  const showBranchFilter = context.role === "OWNER" && branches.length > 1;
  const showingStart = result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1;
  const showingEnd = Math.min(result.total, result.page * result.pageSize);
  const payout = firstParam(params.payout);
  const payoutError = firstParam(params.payoutError);

  return (
    <div className="space-y-6">
      <VendorPaymentsFilterBar
        branches={branches}
        filters={filters}
        showBranchFilter={showBranchFilter}
      />

      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="text-section-title text-fg">Payments</h2>
          <div className="flex items-center gap-3">
            <p className="text-sm text-fg-muted">Showing {showingStart}-{showingEnd} of {result.total}</p>
            <ExportCsvButton href={exportHref(filters)} />
          </div>
        </div>
        <LivePaymentTable
          filters={filters}
          initialItems={result.events}
          key={[filters.query, filters.refundStatus, filters.dateFrom, filters.dateTo, filters.branchId, result.page].map((value) => value ?? "").join("|")}
          liveCursor={result.page === 1 ? encodeLivePaymentCursor({ completedAt: new Date().toISOString(), id: "_" }) : undefined}
        />
        <div className="flex items-center justify-between border-t border-border px-5 py-4">
          <Link
            aria-disabled={result.page <= 1}
            className={`text-sm font-medium ${result.page <= 1 ? "pointer-events-none text-fg-subtle/60" : "text-fg-muted hover:text-fg"}`}
            href={pageHref(filters, Math.max(1, result.page - 1))}
          >
            Previous
          </Link>
          <p className="text-sm text-fg-muted">Page {result.page} of {result.totalPages}</p>
          <Link
            aria-disabled={result.page >= result.totalPages}
            className={`text-sm font-medium ${result.page >= result.totalPages ? "pointer-events-none text-fg-subtle/60" : "text-fg-muted hover:text-fg"}`}
            href={pageHref(filters, Math.min(result.totalPages, result.page + 1))}
          >
            Next
          </Link>
        </div>
      </section>

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

          {payout === "updated" ? (
            <div className="mt-4 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
              Payout destination saved. Future payout runs will use the new Paystack recipient.
            </div>
          ) : null}
          {payoutError ? (
            <div className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
              {payoutError}
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
    </div>
  );
}
