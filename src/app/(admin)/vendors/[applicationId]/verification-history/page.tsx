/**
 * @fileoverview Renders the authenticated administrator page at `/vendors/[applicationId]/verification-history`.
 * @module app/(admin)/vendors/[applicationId]/verification-history/page
 */

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BackButton } from "@/components/ui/BackButton";
import { Metric } from "@/components/ui/Metric";
import { StatusText, type StatusTone } from "@/components/ui/StatusText";
import { requireRoleForRender } from "@/lib/auth/session";
import { getVendorInvoiceHistory } from "@/lib/billing/invoiceQueries";
import { formatMoneyMinor } from "@/lib/formatters";
import { getVendorApplicationById } from "@/lib/vendors/applications";
import { getVendorMonthlyVerificationHistory } from "@/lib/vendors/monthlyVerificationHistory";

const PAYMENT_TONE: Record<string, StatusTone> = {
  UNPAID: "warning",
  PAID: "success",
  NO_PAYMENT_REQUIRED: "neutral",
};

function yearParam(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const year = Number(raw);

  return Number.isInteger(year) ? year : undefined;
}

export default async function VendorVerificationHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ applicationId: string }>;
  searchParams?: Promise<{ year?: string | string[] }>;
}) {
  await requireRoleForRender(["SUPER_ADMIN", "ADMIN"]);

  const { applicationId } = await params;
  const filters = searchParams ? await searchParams : {};
  const application = await getVendorApplicationById(applicationId);

  if (!application || application.status !== "APPROVED") {
    notFound();
  }

  const companyName =
    application.snapshotCompanyName ?? application.vendorProfile.companyName;
  const serviceCategory =
    application.snapshotServiceCategory ?? application.vendorProfile.serviceCategory;
  const history = await getVendorMonthlyVerificationHistory(application.vendorProfileId);
  const invoiceHistory = await getVendorInvoiceHistory(application.vendorProfileId, {
    year: yearParam(filters.year),
  });
  const compactValueClassName = "text-lg leading-tight break-all sm:text-xl xl:text-2xl";

  return (
    <div className="space-y-6">
      <BackButton href="/vendors" label="Back to vendors" />

      <div>
        <h1 className="text-page-title text-fg">Verification history</h1>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-fg-subtle">
          <span>{companyName}</span>
          <span aria-hidden="true">&middot;</span>
          <span>{serviceCategory}</span>
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Metric
          label="Current month"
          value={history.currentMonth.successfulVerifications}
          detail={`${history.currentMonth.label} successful verifications`}
          valueClassName={compactValueClassName}
        />
        <Metric
          label="Amount due"
          value={formatMoneyMinor(history.currentMonth.amountDueMinor, history.currentMonth.currency)}
          detail={`Estimated for ${history.currentMonth.label}`}
          valueClassName={compactValueClassName}
        />
      </div>

      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <div className="flex flex-col gap-4 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-section-title text-fg">Invoices</h2>
            <p className="mt-1 text-sm text-fg-subtle">
              {invoiceHistory.invoices.length} invoice{invoiceHistory.invoices.length === 1 ? "" : "s"} in {invoiceHistory.selectedYear}
            </p>
          </div>
          <form className="flex items-end gap-2" method="get">
            <label className="grid gap-1 text-xs font-medium text-fg-muted">
              Year
              <select
                className="h-10 rounded-md border border-border bg-surface px-3 text-sm font-normal text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                defaultValue={invoiceHistory.selectedYear}
                name="year"
              >
                {invoiceHistory.availableYears.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </label>
            <button
              className="h-10 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700"
              type="submit"
            >
              Apply
            </button>
          </form>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-body">
            <thead className="border-b border-border bg-surface-muted/60">
              <tr className="whitespace-nowrap text-caption uppercase tracking-wide text-fg-subtle">
                <th className="px-4 py-3 font-medium">Invoice</th>
                <th className="px-4 py-3 font-medium">Period</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {invoiceHistory.invoices.map((invoice) => (
                <tr className="align-middle transition hover:bg-surface-muted/60" key={invoice.id}>
                  <td className="px-4 py-3 font-medium text-fg">
                    <Link
                      className="text-brand-600 underline-offset-2 hover:underline"
                      href={`/vendors/invoices/${invoice.id}`}
                    >
                      {invoice.invoiceNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-fg-muted">{invoice.periodLabel}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-medium tabular-nums text-fg">
                    {invoice.currency} {invoice.totalDisplay}
                  </td>
                  <td className="px-4 py-3">
                    <StatusText tone={PAYMENT_TONE[invoice.paymentStatus] ?? "neutral"}>
                      {invoice.paymentStatus.replaceAll("_", " ")}
                    </StatusText>
                    {invoice.hasUnresolvedException && (
                      <p className="mt-1 text-xs text-danger-fg">Needs review</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      aria-label={`View invoice ${invoice.invoiceNumber}`}
                      className="inline-flex items-center text-fg-subtle transition hover:text-fg"
                      href={`/vendors/invoices/${invoice.id}`}
                    >
                      <ChevronRight aria-hidden="true" size={18} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {invoiceHistory.invoices.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-fg-subtle">
              No invoices for {invoiceHistory.selectedYear}.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
