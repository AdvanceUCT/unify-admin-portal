/**
 * @fileoverview Renders the approved vendor page at `/vendor/verifications`.
 * @module app/vendor/(portal)/verifications/page
 */

import Link from "next/link";

import { StatusText } from "@/components/ui/StatusText";
import { prisma } from "@/lib/db/prisma";
import { formatDateTime, formatMoneyMinor } from "@/lib/formatters";
import { requireApprovedVendorContext } from "@/lib/vendors/context";
import {
  listVendorVerificationEvents,
  listVendorVerificationUniversities,
  type VendorVerificationEventFilters,
} from "@/lib/vendors/verifications";
import { ExportCsvButton } from "./ExportCsvButton";
import { VendorVerificationsFilterBar } from "./VendorVerificationsFilterBar";

const TONE = { PENDING: "warning", APPROVED: "success", DECLINED: "danger", EXPIRED: "danger", FAILED: "danger" } as const;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function pageParam(value: string | string[] | undefined) {
  const page = Number(firstParam(value));
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function pageHref(filters: VendorVerificationEventFilters, page: number) {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.university) params.set("university", filters.university);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.branchId) params.set("branchId", filters.branchId);
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
    university?: string | string[];
  }>;
}) {
  const { context } = await requireApprovedVendorContext();
  const params = await searchParams;
  const filters: VendorVerificationEventFilters = {
    branchId: firstParam(params.branchId),
    dateFrom: firstParam(params.dateFrom),
    dateTo: firstParam(params.dateTo),
    page: pageParam(params.page),
    query: firstParam(params.q),
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
        <div className="overflow-x-auto">
          <table className="w-full min-w-[60rem] text-center text-body">
            <thead className="border-b border-border bg-surface-muted/60">
              <tr className="whitespace-nowrap text-caption uppercase tracking-wide text-fg-subtle">
                <th className="px-4 py-3 font-medium">Completed</th>
                <th className="px-4 py-3 font-medium">Branch</th>
                <th className="px-4 py-3 font-medium">Student</th>
                <th className="px-4 py-3 font-medium">Student number</th>
                <th className="px-4 py-3 font-medium">University</th>
                <th className="px-4 py-3 font-medium">Verification</th>
                <th className="px-4 py-3 font-medium">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {result.events.map((event) => {
                const studentName = event.student.name ?? "Student verification";
                const studentNumber = event.student.id ?? "Unavailable";
                const university = event.student.university ?? "Unavailable";
                const price = event.billing.status === "BILLABLE"
                  ? formatMoneyMinor(event.billing.feeMinor, event.billing.currency)
                  : "Not billable";

                return (
                  <tr className="align-middle transition hover:bg-surface-muted/60" key={event.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-fg-muted">
                      {formatDateTime(event.completedAt ?? event.createdAt)}
                    </td>
                    <td className="px-4 py-3 font-medium text-fg">{event.branchName}</td>
                    <td className="px-4 py-3 font-medium text-fg">{studentName}</td>
                    <td className="px-4 py-3 text-fg-muted">{studentNumber}</td>
                    <td className="px-4 py-3 text-fg-muted">{university}</td>
                    <td className="px-4 py-3">
                      <StatusText tone={TONE[event.status]}>{event.status}</StatusText>
                      {event.failureReason && (
                        <p className="mt-1 max-w-48 text-xs text-danger-fg">
                          {event.failureReason}
                          {event.failureCode && <span className="font-mono"> ({event.failureCode})</span>}
                        </p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium tabular-nums text-fg">{price}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {result.events.length === 0 && <p className="px-5 py-8 text-center text-sm text-fg-subtle">No verification events match these filters.</p>}
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
