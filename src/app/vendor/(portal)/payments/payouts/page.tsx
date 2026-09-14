/**
 * @fileoverview Renders vendor payout batch history.
 * @module app/vendor/(portal)/payments/payouts/page
 */

import { BackButton } from "@/components/ui/BackButton";
import { PayoutHistoryFilterBar } from "@/features/vendors/PayoutHistoryFilterBar";
import { PayoutHistoryTable } from "@/features/vendors/PayoutHistoryTable";
import type { PayoutBatchStatus, PayoutInitiationSource } from "@/generated/prisma/enums";
import { requireApprovedVendorContextForRender } from "@/lib/vendors/context";
import { listVendorPayoutHistory, type VendorPayoutHistoryFilters } from "@/lib/vendors/payoutHistory";

const BASE_PATH = "/vendor/payments/payouts";

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

      <PayoutHistoryFilterBar basePath={BASE_PATH} filters={filters} />
      <PayoutHistoryTable basePath={BASE_PATH} filters={filters} result={result} />
    </div>
  );
}
