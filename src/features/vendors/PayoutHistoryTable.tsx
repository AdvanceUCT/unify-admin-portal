/**
 * @fileoverview Shared payout-history table for vendor and admin views.
 * @module features/vendors/PayoutHistoryTable
 */

import Link from "next/link";

import { StatusText, type StatusTone } from "@/components/ui/StatusText";
import type { PayoutBatchStatus } from "@/generated/prisma/enums";
import { formatDateTime, formatMoneyMinor } from "@/lib/formatters";
import type { VendorPayoutHistoryFilters } from "@/lib/vendors/payoutHistory";

const STATUS_TONE: Record<PayoutBatchStatus, StatusTone> = {
  COMPLETED: "success",
  FAILED: "danger",
  PENDING: "warning",
  PROCESSING: "warning",
  REQUIRES_RECONCILIATION: "danger",
};

type PayoutHistoryResult = Awaited<ReturnType<typeof import("@/lib/vendors/payoutHistory").listVendorPayoutHistory>>;

function pageHref(basePath: string, filters: VendorPayoutHistoryFilters, page: number) {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.initiationSource) params.set("source", filters.initiationSource);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  params.set("page", String(page));
  return `${basePath}?${params.toString()}`;
}

function titleCaseStatus(status: string) {
  return status
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function PayoutHistoryTable({
  basePath,
  emptyMessage = "No payout batches match these filters.",
  filters,
  result,
}: {
  basePath: string;
  emptyMessage?: string;
  filters: VendorPayoutHistoryFilters;
  result: PayoutHistoryResult;
}) {
  return (
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
            {emptyMessage}
          </p>
        ) : null}
      </div>
      <div className="flex items-center justify-between border-t border-border px-5 py-4">
        <Link
          aria-disabled={result.page <= 1}
          className={`text-sm font-medium ${result.page <= 1 ? "pointer-events-none text-fg-subtle/60" : "text-fg-muted hover:text-fg"}`}
          href={pageHref(basePath, filters, Math.max(1, result.page - 1))}
        >
          Previous
        </Link>
        <p className="text-sm text-fg-muted">Page {result.page} of {result.totalPages}</p>
        <Link
          aria-disabled={result.page >= result.totalPages}
          className={`text-sm font-medium ${result.page >= result.totalPages ? "pointer-events-none text-fg-subtle/60" : "text-fg-muted hover:text-fg"}`}
          href={pageHref(basePath, filters, Math.min(result.totalPages, result.page + 1))}
        >
          Next
        </Link>
      </div>
    </section>
  );
}
