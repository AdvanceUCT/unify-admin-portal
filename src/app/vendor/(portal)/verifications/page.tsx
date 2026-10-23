/**
 * @fileoverview Renders the approved vendor page at `/vendor/verifications`.
 * @module app/vendor/(portal)/verifications/page
 */

import Link from "next/link";

import { prisma } from "@/lib/db/prisma";
import { requireApprovedVendorContextForRender } from "@/lib/vendors/context";
import { encodeLiveVerificationCursor } from "@/lib/vendors/liveVerifications";
import {
  listVendorVerificationEvents,
  listVendorVerificationUniversities,
  type VendorVerificationEventFilters,
  type VendorVerificationSource,
} from "@/lib/vendors/verifications";
import { ExportCsvButton } from "./ExportCsvButton";
import { LiveVerificationTable } from "./LiveVerificationTable";
import { VendorVerificationsFilterBar } from "./VendorVerificationsFilterBar";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function pageParam(value: string | string[] | undefined) {
  const page = Number(firstParam(value));
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function sourceParam(value: string | string[] | undefined): VendorVerificationSource | undefined {
  const source = firstParam(value);
  return source === "qr" || source === "api" ? source : undefined;
}

function pageHref(filters: VendorVerificationEventFilters, page: number) {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.university) params.set("university", filters.university);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.branchId) params.set("branchId", filters.branchId);
  if (filters.source) params.set("source", filters.source);
  params.set("page", String(page));
  return `/vendor/verifications?${params.toString()}`;
}

function exportHref(filters: VendorVerificationEventFilters) {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.university) params.set("university", filters.university);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.branchId) params.set("branchId", filters.branchId);
  if (filters.source) params.set("source", filters.source);
  const query = params.toString();
  return `/api/vendor/verifications/export${query ? `?${query}` : ""}`;
}

export default async function VendorVerificationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    branchId?: string | string[];
    dateFrom?: string | string[];
    dateTo?: string | string[];
    page?: string | string[];
    q?: string | string[];
    source?: string | string[];
    university?: string | string[];
  }>;
}) {
  const { context } = await requireApprovedVendorContextForRender();
  const params = await searchParams;
  const filters: VendorVerificationEventFilters = {
    branchId: firstParam(params.branchId),
    dateFrom: firstParam(params.dateFrom),
    dateTo: firstParam(params.dateTo),
    page: pageParam(params.page),
    query: firstParam(params.q),
    source: sourceParam(params.source),
    university: firstParam(params.university),
  };
  const [branches, universities, result] = await Promise.all([
    prisma.vendorBranch.findMany({
      where: {
        vendorProfileId: context.vendorProfileId,
        ...(context.role === "STAFF" ? { id: { in: context.branchIds } } : {}),
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    listVendorVerificationUniversities(context.vendorProfileId, context.branchIds),
    listVendorVerificationEvents(context.vendorProfileId, context.branchIds, filters),
  ]);
  const showBranchFilter = context.role === "OWNER" && branches.length > 1;
  const showingStart = result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1;
  const showingEnd = Math.min(result.total, result.page * result.pageSize);

  return (
    <div className="space-y-6">
      <VendorVerificationsFilterBar
        branches={branches}
        filters={filters}
        showBranchFilter={showBranchFilter}
        universities={universities}
      />

      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="text-section-title text-fg">Events</h2>
          <div className="flex items-center gap-3">
            <p className="text-sm text-fg-muted">Showing {showingStart}-{showingEnd} of {result.total}</p>
            <ExportCsvButton href={exportHref(filters)} />
          </div>
        </div>
        <LiveVerificationTable
          filters={filters}
          initialEvents={result.events}
          key={[filters.query, filters.university, filters.dateFrom, filters.dateTo, filters.branchId, filters.source, result.page].map((value) => value ?? "").join("|")}
          liveCursor={result.page === 1 ? encodeLiveVerificationCursor({ completedAt: new Date().toISOString(), id: "_" }) : undefined}
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
