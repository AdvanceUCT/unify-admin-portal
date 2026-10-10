/**
 * @fileoverview Renders vendor payout batch history.
 * @module app/vendor/(portal)/payments/payouts/page
 */

import { Clock, PauseCircle, WalletCards } from "lucide-react";

import { BackButton } from "@/components/ui/BackButton";
import { PayoutHistoryFilterBar } from "@/features/vendors/PayoutHistoryFilterBar";
import { PayoutHistoryTable } from "@/features/vendors/PayoutHistoryTable";
import type { PayoutBatchStatus } from "@/generated/prisma/enums";
import { formatMoneyMinor } from "@/lib/formatters";
import { getUniversityPaymentWalletSettings } from "@/lib/payments/config";
import { DEFAULT_PAYOUT_THRESHOLD_MINOR } from "@/lib/payments/constants";
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

export default async function VendorPayoutHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    dateFrom?: string | string[];
    dateTo?: string | string[];
    page?: string | string[];
    status?: string | string[];
  }>;
}) {
  const { context } = await requireApprovedVendorContextForRender();
  const params = await searchParams;
  const filters: VendorPayoutHistoryFilters = {
    dateFrom: firstParam(params.dateFrom),
    dateTo: firstParam(params.dateTo),
    page: pageParam(params.page),
    status: statusParam(params.status),
  };
  const [result, walletSettings] = await Promise.all([
    listVendorPayoutHistory(context, filters),
    getUniversityPaymentWalletSettings(),
  ]);
  const thresholdMinor = walletSettings?.paymentWalletPayoutThresholdMinor ?? BigInt(DEFAULT_PAYOUT_THRESHOLD_MINOR);

  return (
    <div className="space-y-6">
      <BackButton href="/vendor/payments" label="Back to payments" />

      <section className="rounded-xl border border-border bg-surface p-5 shadow-md">
        <h1 className="text-page-title text-fg">Payout history</h1>
        <p className="mt-1 text-sm text-fg-subtle">Every payout from your wallet.</p>
        <ul className="mt-4 flex flex-wrap gap-2 text-xs text-fg-muted">
          <li className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1">
            <Clock aria-hidden="true" size={13} />
            Nightly at 00:35
          </li>
          <li className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1">
            <WalletCards aria-hidden="true" size={13} />
            Pays out from {formatMoneyMinor(Number(thresholdMinor))}
          </li>
          <li className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1">
            <PauseCircle aria-hidden="true" size={13} />
            Paused if balance is negative
          </li>
        </ul>
      </section>

      <PayoutHistoryFilterBar basePath={BASE_PATH} filters={filters} />
      <PayoutHistoryTable basePath={BASE_PATH} filters={filters} result={result} />
    </div>
  );
}
