/**
 * @fileoverview Renders completed student wallet payments for an approved vendor.
 * @module app/vendor/(portal)/payments/page
 */

import Link from "next/link";

import { prisma } from "@/lib/db/prisma";
import { requireApprovedVendorContextForRender } from "@/lib/vendors/context";
import {
  encodeLivePaymentCursor,
  listVendorPaymentEvents,
  type VendorPaymentEventFilters,
} from "@/lib/vendors/livePayments";
import { listActivePaymentBranchIdsForContext } from "@/lib/payments/branchOnboarding";
import { getVendorPayoutOverview } from "@/lib/vendors/payouts";
import { ExportCsvButton } from "../verifications/ExportCsvButton";
import { LivePaymentTable } from "./LivePaymentTable";
import { VendorPaymentsFilterBar } from "./VendorPaymentsFilterBar";
import { VendorWalletBalanceCard } from "./VendorWalletBalanceCard";

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

function resultPageCanPollLivePayments(
  selectedBranchId: string | undefined,
  activePaymentBranchIds: string[],
) {
  return selectedBranchId
    ? activePaymentBranchIds.includes(selectedBranchId)
    : activePaymentBranchIds.length > 0;
}

export default async function VendorPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    branchId?: string | string[];
    dateFrom?: string | string[];
    dateTo?: string | string[];
    page?: string | string[];
    q?: string | string[];
    refundStatus?: string | string[];
  }>;
}) {
  const { context } = await requireApprovedVendorContextForRender();
  const params = await searchParams;
  const [allBranches, activePaymentBranchIds] = await Promise.all([
    prisma.vendorBranch.findMany({
      where: {
        vendorProfileId: context.vendorProfileId,
        id: { in: context.branchIds },
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    listActivePaymentBranchIdsForContext(context),
  ]);
  const branches: Array<{ id: string; name: string }> = allBranches.filter((branch) =>
    context.branchIds.includes(branch.id),
  );
  const paymentHistoryBranchIds = branches.map((branch) => branch.id);

  if (paymentHistoryBranchIds.length === 0) {
    return (
      <div className="space-y-6">
        <section className="rounded-xl border border-warning-border bg-warning-bg p-5 shadow-md">
          <h1 className="text-section-title text-fg">No payment branches available</h1>
          <p className="mt-2 text-sm leading-6 text-warning-fg">
            To request approval, add a service point and submit a payment access application.
          </p>
        </section>

        {context.role === "OWNER" ? (
          <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-section-title text-fg">Service points</h2>
            </div>
            <div className="divide-y divide-border">
              {allBranches.length === 0 ? (
                <p className="px-5 py-6 text-sm text-fg-subtle">
                  Add a branch before requesting payment access.
                </p>
              ) : (
                allBranches.map((branch) => (
                  <Link
                    className="flex items-center justify-between gap-4 px-5 py-4 text-sm font-medium text-fg-muted transition hover:bg-surface-muted/60 hover:text-fg"
                    href={`/vendor/branches/${branch.id}/payment-access`}
                    key={branch.id}
                  >
                    <span>{branch.name}</span>
                    <span>Submit application</span>
                  </Link>
                ))
              )}
            </div>
          </section>
        ) : (
          <section className="rounded-xl border border-border bg-surface p-5 shadow-md">
            <p className="text-sm text-fg-muted">
              Ask the vendor owner to submit a payment access application for your service point.
            </p>
          </section>
        )}
      </div>
    );
  }

  const paymentContext = { ...context, branchIds: paymentHistoryBranchIds };
  const branchId = firstParam(params.branchId);
  const selectedBranchId = branchId && paymentHistoryBranchIds.includes(branchId)
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
  const canPollLivePayments = resultPageCanPollLivePayments(selectedBranchId, activePaymentBranchIds);
  const [payoutOverview, result] = await Promise.all([
    context.role === "OWNER" ? getVendorPayoutOverview(context) : Promise.resolve(null),
    listVendorPaymentEvents(paymentContext, filters),
  ]);
  const showBranchFilter = context.role === "OWNER" && branches.length > 1;
  const showingStart = result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1;
  const showingEnd = Math.min(result.total, result.page * result.pageSize);

  return (
    <div className="space-y-6">
      {payoutOverview ? (
        <VendorWalletBalanceCard
          canRunDemoPayout={context.role === "OWNER"}
          overview={payoutOverview}
        />
      ) : null}

      {activePaymentBranchIds.length === 0 ? (
        <section className="rounded-xl border border-warning-border bg-warning-bg p-5 shadow-md">
          <h1 className="text-section-title text-fg">Payment approval is currently inactive</h1>
          <p className="mt-2 text-sm leading-6 text-warning-fg">
            Past wallet payments remain visible here, but no branch can accept new wallet payments until access is approved again.
          </p>
        </section>
      ) : null}

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
          activePaymentBranchIds={activePaymentBranchIds}
          filters={filters}
          initialItems={result.events}
          key={[filters.query, filters.refundStatus, filters.dateFrom, filters.dateTo, filters.branchId, result.page].map((value) => value ?? "").join("|")}
          liveCursor={result.page === 1 && canPollLivePayments ? encodeLivePaymentCursor({ completedAt: new Date().toISOString(), id: "_" }) : undefined}
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
    </div>
  );
}
