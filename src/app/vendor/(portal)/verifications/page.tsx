import Link from "next/link";

import { Badge } from "@/components/ui/Badge";
import { prisma } from "@/lib/db/prisma";
import { formatDateTime } from "@/lib/formatters";
import { requireApprovedVendorContext } from "@/lib/vendors/context";
import {
  listVendorVerificationEvents,
  listVendorVerificationUniversities,
  type VendorVerificationEventFilters,
} from "@/lib/vendors/verifications";

const TONE = { PENDING: "warning", APPROVED: "success", DECLINED: "danger", EXPIRED: "danger", FAILED: "danger" } as const;
const inputClassName =
  "h-10 rounded-md border border-border bg-surface px-3 text-sm font-normal text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";
const labelClassName = "grid gap-1 text-xs font-medium text-fg-muted";

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
      <section className="rounded-xl border border-border bg-surface p-4 shadow-md">
        <form className="grid gap-3 lg:grid-cols-[minmax(14rem,1fr)_repeat(3,minmax(10rem,12rem))_auto]" method="get">
          <label className={labelClassName}>
            Search
            <input className={inputClassName} defaultValue={filters.query ?? ""} name="q" placeholder="Name or student number" />
          </label>
          <label className={labelClassName}>
            University
            <select className={inputClassName} defaultValue={filters.university ?? ""} name="university">
              <option value="">All universities</option>
              {universities.map((university) => <option key={university} value={university}>{university}</option>)}
            </select>
          </label>
          <label className={labelClassName}>
            From
            <input className={inputClassName} defaultValue={filters.dateFrom ?? ""} name="dateFrom" type="date" />
          </label>
          <label className={labelClassName}>
            To
            <input className={inputClassName} defaultValue={filters.dateTo ?? ""} name="dateTo" type="date" />
          </label>
          {showBranchFilter && (
            <label className={`${labelClassName} lg:col-span-2`}>
              Branch
              <select className={inputClassName} defaultValue={filters.branchId ?? ""} name="branchId">
                <option value="">All branches</option>
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            </label>
          )}
          <div className="flex items-end gap-2">
            <button className="h-10 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700" type="submit">Apply</button>
            <Link className="inline-flex h-10 items-center rounded-md bg-surface-muted px-3 text-sm font-medium text-fg-muted transition hover:bg-brand-50 hover:text-brand-700" href="/vendor/verifications">Reset</Link>
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="text-section-title text-fg">Events</h2>
          <div className="flex items-center gap-3">
            <p className="text-sm text-fg-muted">Showing {showingStart}-{showingEnd} of {result.total}</p>
            <a className="inline-flex h-9 items-center rounded-md border border-border bg-surface px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg" href={exportHref(filters)}>Export CSV</a>
          </div>
        </div>
        <div className="divide-y divide-border">
          {result.events.map((event) => (
            <div className="grid gap-3 px-5 py-4 transition hover:bg-surface-muted/60 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]" key={event.id}>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-fg">{event.student.name ?? "Student verification"}</p>
                <p className="mt-1 text-xs text-fg-subtle">{event.branchName} / {formatDateTime(event.completedAt ?? event.createdAt)}</p>
              </div>
              <dl className="grid gap-0.5 text-xs">
                <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2">
                  <dt className="text-fg-subtle">Number</dt>
                  <dd className="truncate font-medium text-fg-muted">{event.student.id ?? "Unavailable"}</dd>
                </div>
                <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2">
                  <dt className="text-fg-subtle">University</dt>
                  <dd className="truncate font-medium text-fg-muted">{event.student.university ?? "Unavailable"}</dd>
                </div>
              </dl>
              <div className="flex items-start justify-between gap-3 lg:justify-end">
                {event.failureReason && <p className="max-w-sm text-xs text-danger-fg">{event.failureReason}</p>}
                <Badge tone={TONE[event.status]}>{event.status}</Badge>
              </div>
            </div>
          ))}
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
