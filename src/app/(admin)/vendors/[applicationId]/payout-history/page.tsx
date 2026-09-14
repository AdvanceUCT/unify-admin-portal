/**
 * @fileoverview Renders the authenticated administrator page at `/vendors/[applicationId]/payout-history`.
 * @module app/(admin)/vendors/[applicationId]/payout-history/page
 */

import { notFound } from "next/navigation";

import { BackButton } from "@/components/ui/BackButton";
import { PayoutHistoryFilterBar } from "@/features/vendors/PayoutHistoryFilterBar";
import { PayoutHistoryTable } from "@/features/vendors/PayoutHistoryTable";
import type { PayoutBatchStatus, PayoutInitiationSource } from "@/generated/prisma/enums";
import { requireRoleForRender } from "@/lib/auth/session";
import { getVendorApplicationById } from "@/lib/vendors/applications";
import { listVendorPayoutHistoryForVendorProfile, type VendorPayoutHistoryFilters } from "@/lib/vendors/payoutHistory";

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

export default async function AdminVendorPayoutHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ applicationId: string }>;
  searchParams?: Promise<{
    dateFrom?: string | string[];
    dateTo?: string | string[];
    page?: string | string[];
    source?: string | string[];
    status?: string | string[];
  }>;
}) {
  await requireRoleForRender(["SUPER_ADMIN", "ADMIN"]);

  const { applicationId } = await params;
  const application = await getVendorApplicationById(applicationId);
  if (!application || application.status !== "APPROVED") {
    notFound();
  }

  const query = searchParams ? await searchParams : {};
  const filters: VendorPayoutHistoryFilters = {
    dateFrom: firstParam(query.dateFrom),
    dateTo: firstParam(query.dateTo),
    initiationSource: sourceParam(query.source),
    page: pageParam(query.page),
    status: statusParam(query.status),
  };
  const basePath = `/vendors/${applicationId}/payout-history`;
  const result = await listVendorPayoutHistoryForVendorProfile(application.vendorProfileId, filters);
  const companyName = application.snapshotCompanyName ?? application.vendorProfile.companyName;
  const serviceCategory = application.snapshotServiceCategory ?? application.vendorProfile.serviceCategory;
  const showingStart = result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1;
  const showingEnd = Math.min(result.total, result.page * result.pageSize);

  return (
    <div className="space-y-6">
      <BackButton href="/vendors" label="Back to vendors" />

      <section className="rounded-xl border border-border bg-surface p-5 shadow-md">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-page-title text-fg">Payout history</h1>
            <p className="mt-1 text-sm text-fg-subtle">
              {companyName} &middot; {serviceCategory}
            </p>
            <p className="mt-2 max-w-3xl text-sm text-fg-muted">
              Admin view of scheduled and manual payout batches for this vendor wallet. This mirrors the vendor portal
              payout history without exposing payout-destination secrets.
            </p>
          </div>
          <p className="text-sm text-fg-muted">Showing {showingStart}-{showingEnd} of {result.total}</p>
        </div>
      </section>

      <PayoutHistoryFilterBar basePath={basePath} filters={filters} />
      <PayoutHistoryTable
        basePath={basePath}
        emptyMessage="No payout batches match these filters for this vendor."
        filters={filters}
        result={result}
      />
    </div>
  );
}
