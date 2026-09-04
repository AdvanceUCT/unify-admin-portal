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
import { listVendorApplications } from "@/lib/vendors/applications";
import { GenerateInvoiceForm } from "./GenerateInvoiceForm";
import { InvoiceTable } from "./InvoiceTable";

const STATUS_TABS = [
  { label: "All", value: undefined },
  { label: "Unpaid", value: "UNPAID" },
  { label: "Flagged", value: "FLAGGED" },
  { label: "Paid", value: "PAID" },
] as const;

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await requireRole(["SUPER_ADMIN", "ADMIN"]);
  const isSuperAdmin = session.user.role === "SUPER_ADMIN";

  const { status } = await searchParams;
  const activeStatus = STATUS_TABS.some((tab) => tab.value === status) ? status : undefined;

  const [overdueInvoices, allInvoices, suspendedVendorCount, approvedApplications] = await Promise.all([
    getOverdueInvoices(),
    getAllInvoices({ status: activeStatus }),
    getSuspendedVendorCount(),
    isSuperAdmin ? listVendorApplications({ status: "APPROVED" }) : Promise.resolve([]),
  ]);

  const totalOverdueAmountCents = overdueInvoices.reduce((sum, invoice) => sum + invoice.totalCents, 0);
  const vendors = approvedApplications.map((application) => ({
    id: application.vendorProfileId,
    companyName: application.vendorProfile.companyName,
  }));

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
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="text-section-title text-fg">All Invoices</h2>
          <PageTabs
            tabs={STATUS_TABS.map((tab) => ({
              href: tab.value ? `/billing?status=${tab.value}` : "/billing",
              isActive: activeStatus === tab.value,
              label: tab.label,
            }))}
          />
        </div>
        <InvoiceTable invoices={allInvoices} />
      </section>

      {isSuperAdmin && <GenerateInvoiceForm vendors={vendors} />}
    </div>
  );
}
