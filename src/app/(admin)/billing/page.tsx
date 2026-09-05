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
import { RunInvoiceGenerationButton } from "./RunInvoiceGenerationButton";

const STATUS_TABS = [
  { label: "All", value: undefined },
  { label: "Unpaid", value: "UNPAID" },
  { label: "Flagged", value: "FLAGGED" },
  { label: "Paid", value: "PAID" },
] as const;

function billingHref(status: string | undefined, query: string | undefined) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (query) params.set("q", query);
  const search = params.toString();
  return search ? `/billing?${search}` : "/billing";
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const session = await requireRole(["SUPER_ADMIN", "ADMIN"]);
  const isSuperAdmin = session.user.role === "SUPER_ADMIN";

  const { status, q } = await searchParams;
  const activeStatus = STATUS_TABS.some((tab) => tab.value === status) ? status : undefined;
  const query = q?.trim() || undefined;

  const [overdueInvoices, allInvoices, suspendedVendorCount] = await Promise.all([
    getOverdueInvoices(),
    getAllInvoices({ status: activeStatus, vendorNameQuery: query }),
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
                Generated automatically on the 1st of each month from each vendor&apos;s actual
                verification count.
              </p>
            </div>
            {isSuperAdmin && <RunInvoiceGenerationButton />}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <form action="/billing" className="flex items-center gap-2" method="get">
              {activeStatus && <input name="status" type="hidden" value={activeStatus} />}
              <input
                className="h-9 w-56 rounded-md border border-border px-3 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                defaultValue={query ?? ""}
                name="q"
                placeholder="Search vendor name..."
                type="search"
              />
            </form>
            <PageTabs
              tabs={STATUS_TABS.map((tab) => ({
                href: billingHref(tab.value, query),
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
