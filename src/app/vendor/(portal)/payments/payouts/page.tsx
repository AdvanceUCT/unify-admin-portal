/**
 * @fileoverview Renders vendor payout batch history.
 * @module app/vendor/(portal)/payments/payouts/page
 */

import Link from "next/link";

import { BackButton } from "@/components/ui/BackButton";
import { StatusText, type StatusTone } from "@/components/ui/StatusText";
import type { PayoutBatchStatus, PayoutInitiationSource } from "@/generated/prisma/enums";
import { formatDateTime, formatMoneyMinor } from "@/lib/formatters";
import { requireApprovedVendorContextForRender } from "@/lib/vendors/context";
import { listVendorPayoutHistory, type VendorPayoutHistoryFilters } from "@/lib/vendors/payouts";
import { PayoutHistoryFilterBar } from "./PayoutHistoryFilterBar";

const STATUS_TONE: Record<PayoutBatchStatus, StatusTone> = {
  COMPLETED: "success",
  FAILED: "danger",
  PENDING: "warning",
  PROCESSING: "warning",
  REQUIRES_RECONCILIATION: "danger",
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function pageParam(value: string | string[] | undefined) {
  const page = Number(firstParam(value));
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function statusParam(value: string | string[] | undefined): PayoutBatchStatus | undefined {
  const status = firstParam(value);
  return status === "PENDING" ||
    status === "PROCESSING" ||
    status === "COMPLETED" ||
    status === "FAILED" ||
    status === "REQUIRES_RECONCILIATION"
    ? status
    : undefined;
}

function sourceParam(value: string | string[] | undefined): PayoutInitiationSource | undefined {
  const source = firstParam(value);
  return source === "SCHEDULED" || source === "MANUAL" ? source : undefined;
}

function pageHref(filters: VendorPayoutHistoryFilters, page: number) {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.initiationSource) params.set("source", filters.initiationSource);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  params.set("page", String(page));
  return `/vendor/payments/payouts?${params.toString()}`;
}

function titleCaseStatus(status: string) {
  return status
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export default async function VendorPayoutHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    dateFrom?: string | string[];
    dateTo?: string | string[];
    page?: string | string[];
    source?: string | string[];
    status?: string | string[];
  }>;
}) {
  const { context } = await requireApprovedVendorContextForRender();
  const params = await searchParams;
  const filters: VendorPayoutHistoryFilters = {
    dateFrom: firstParam(params.dateFrom),
    dateTo: firstParam(params.dateTo),
    initiationSource: sourceParam(params.source),
    page: pageParam(params.page),
    status: statusParam(params.status),
  };
  const result = await listVendorPayoutHistory(context, filters);
  const showingStart = result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1;
  const showingEnd = Math.min(result.total, result.page * result.pageSize);

  return (
    <div className="space-y-6">
      <BackButton href="/vendor/payments" label="Back to payments" />

      <section className="rounded-xl border border-border bg-surface p-5 shadow-md">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-page-title text-fg">Payout history</h1>
            <p className="mt-1 text-sm text-fg-subtle">
              Review scheduled and manual payout batches from your vendor wallet.
            </p>
          </div>
          <p className="text-sm text-fg-muted">Showing {showingStart}-{showingEnd} of {result.total}</p>
        </div>
      </section>

      <PayoutHistoryFilterBar filters={filters} />

      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-section-title text-fg">Payout batches</h2>
          <p className="text-sm text-fg-muted">
            {result.total} payout{result.total === 1 ? "" : "s"}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[64rem] text-left text-body">
            <thead className="border-b border-border bg-surface-muted/60">
              <tr className="whitespace-nowrap text-caption uppercase tracking-wide text-fg-subtle">
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Cutoff</th>
                <th className="px-4 py-3 font-medium">Completed</th>
                <th className="px-4 py-3 font-medium">Reference</th>
                <th className="px-4 py-3 font-medium">Attempts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {result.payouts.map((payout) => (
                <tr className="align-middle transition hover:bg-surface-muted/60" key={payout.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-fg-muted">{formatDateTime(payout.createdAt)}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-medium tabular-nums text-fg">
                    {formatMoneyMinor(payout.amountMinor, payout.currency)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusText tone={STATUS_TONE[payout.status]}>{titleCaseStatus(payout.status)}</StatusText>
                    {payout.failureCode ? (
                      <p className="mt-1 text-xs text-danger-fg">{payout.failureCode}</p>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-fg-muted">{titleCaseStatus(payout.initiationSource)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-fg-muted">{formatDateTime(payout.cutoffAt)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-fg-muted">
                    {payout.completedAt ? formatDateTime(payout.completedAt) : "-"}
                  </td>
                  <td className="px-4 py-3">
                    <p className="max-w-[16rem] truncate font-mono text-xs text-fg-muted">{payout.reference}</p>
                    {payout.providerPayoutId ? (
                      <p className="mt-1 max-w-[16rem] truncate text-xs text-fg-subtle">{payout.providerPayoutId}</p>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-fg-muted">
                    {payout.attemptCount}
                    {payout.lastAttemptAt ? (
                      <p className="mt-1 text-xs text-fg-subtle">{formatDateTime(payout.lastAttemptAt)}</p>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {result.payouts.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-fg-subtle">
              No payout batches match these filters.
            </p>
          ) : null}
        </div>
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
