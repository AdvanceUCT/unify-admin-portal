/**
 * @fileoverview Renders the authenticated administrator page at `/billing`.
 * @module app/(admin)/billing/page
 */

import { Metric } from "@/components/ui/Metric";
import { PageTabs } from "@/components/layout/PageTabs";
import { requireRole } from "@/lib/auth/session";
import {
  getAllInvoices,
  getOverdueInvoices,
  getSuspendedVendorCount,
} from "@/lib/billing/invoiceService";
import { InvoiceTable } from "./InvoiceTable";
import { RefreshInvoicesButton } from "./RefreshInvoicesButton";

const STATUS_TABS = [
  { label: "All", value: undefined },
  { label: "Unpaid", value: "UNPAID" },
  { label: "Flagged", value: "FLAGGED" },
  { label: "Paid", value: "PAID" },
] as const;

type BillingFilters = { status?: string; query?: string; dateFrom?: string; dateTo?: string };

function billingHref(overrides: Partial<BillingFilters>, current: BillingFilters) {
  const merged = { ...current, ...overrides };
  const params = new URLSearchParams();
  if (merged.status) params.set("status", merged.status);
  if (merged.query) params.set("q", merged.query);
  if (merged.dateFrom) params.set("dateFrom", merged.dateFrom);
  if (merged.dateTo) params.set("dateTo", merged.dateTo);
  const search = params.toString();
  return search ? `/billing?${search}` : "/billing";
}

function parsedDate(value: string | undefined, endOfDay = false) {
  if (!value) return undefined;
  const parsed = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
  return Number.isFinite(parsed.getTime()) ? parsed : undefined;
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; dateFrom?: string; dateTo?: string }>;
}) {
  const session = await requireRole(["SUPER_ADMIN", "ADMIN"]);
  const isSuperAdmin = session.user.role === "SUPER_ADMIN";

  const { status, q, dateFrom, dateTo } = await searchParams;
  const activeStatus = STATUS_TABS.some((tab) => tab.value === status) ? status : undefined;
  const query = q?.trim() || undefined;
  const currentFilters: BillingFilters = { dateFrom, dateTo, query, status: activeStatus };

  const [overdueInvoices, allInvoices, suspendedVendorCount] = await Promise.all([
    getOverdueInvoices(),
    getAllInvoices({
      status: activeStatus,
      vendorNameQuery: query,
      periodFrom: parsedDate(dateFrom),
      periodTo: parsedDate(dateTo, true),
    }),
    getSuspendedVendorCount(),
  ]);

  const totalOverdueAmountCents = overdueInvoices.reduce((sum, invoice) => sum + invoice.totalCents, 0);

  return (
    <div className="space-y-6">
      <p className="text-sm text-fg-subtle">Manage vendor invoices and verification access.</p>

      <div className="grid gap-4 sm:grid-cols-3">
        <Metric
          detail={overdueInvoices.length > 0 ? "Needs admin attention" : "All invoices are current"}
          label="Overdue invoices"
          tone={overdueInvoices.length > 0 ? "danger" : "neutral"}
          value={overdueInvoices.length}
        />
        <Metric
          detail={overdueInvoices.length > 0 ? "Outstanding across all vendors" : "Nothing outstanding"}
          label="Total amount overdue"
          tone={totalOverdueAmountCents > 0 ? "danger" : "neutral"}
          value={`R ${(totalOverdueAmountCents / 100).toFixed(2)}`}
        />
        <Metric
          detail={suspendedVendorCount > 0 ? "Verification access blocked" : "No active suspensions"}
          label="Vendors suspended"
          tone={suspendedVendorCount > 0 ? "warning" : "neutral"}
          value={suspendedVendorCount}
        />
      </div>

      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-section-title text-fg">Overdue Invoices</h2>
        </div>
        {overdueInvoices.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-success-fg">No overdue invoices</p>
        ) : (
          <InvoiceTable invoices={overdueInvoices} />
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <div className="space-y-3 border-b border-border px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-section-title text-fg">All Invoices</h2>
              <p className="mt-0.5 text-xs text-fg-subtle">
                Invoices generate automatically shortly after each month ends. Press Refresh to
                run this now — for testing or a backfill — using the same verification counts.
              </p>
            </div>
            {isSuperAdmin && <RefreshInvoicesButton />}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <form action="/billing" className="flex flex-wrap items-center gap-2" method="get">
              {activeStatus && <input name="status" type="hidden" value={activeStatus} />}
              <input
                className="h-9 w-56 rounded-md border border-border px-3 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                defaultValue={query ?? ""}
                name="q"
                placeholder="Search vendor name..."
                type="search"
              />
              <input
                aria-label="Period from"
                className="h-9 rounded-md border border-border px-3 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                defaultValue={dateFrom ?? ""}
                name="dateFrom"
                type="date"
              />
              <span className="text-sm text-fg-subtle">to</span>
              <input
                aria-label="Period to"
                className="h-9 rounded-md border border-border px-3 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                defaultValue={dateTo ?? ""}
                name="dateTo"
                type="date"
              />
              <button
                className="h-9 rounded-md border border-border bg-surface px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg"
                type="submit"
              >
                Filter
              </button>
              {(query || dateFrom || dateTo) && (
                <a
                  className="text-sm font-medium text-fg-subtle hover:text-fg"
                  href={billingHref({ dateFrom: undefined, dateTo: undefined, query: undefined }, currentFilters)}
                >
                  Clear
                </a>
              )}
            </form>
            <PageTabs
              tabs={STATUS_TABS.map((tab) => ({
                href: billingHref({ status: tab.value }, currentFilters),
                isActive: activeStatus === tab.value,
                label: tab.label,
              }))}
            />
          </div>
        </div>
        <InvoiceTable invoices={allInvoices} />
      </section>
    </div>
  );
}
