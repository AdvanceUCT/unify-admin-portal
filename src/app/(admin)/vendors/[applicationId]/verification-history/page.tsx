/**
 * @fileoverview Renders the authenticated administrator page at `/vendors/[applicationId]/verification-history`.
 * @module app/(admin)/vendors/[applicationId]/verification-history/page
 */

import { notFound } from "next/navigation";

import { BackButton } from "@/components/ui/BackButton";
import { Metric } from "@/components/ui/Metric";
import { requireRole } from "@/lib/auth/session";
import { formatMoneyMinor } from "@/lib/formatters";
import { getVendorApplicationById } from "@/lib/vendors/applications";
import { getVendorMonthlyVerificationHistory } from "@/lib/vendors/monthlyVerificationHistory";

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
  await requireRole(["SUPER_ADMIN", "ADMIN"]);

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
  const history = await getVendorMonthlyVerificationHistory(application.vendorProfileId, {
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
          detail={`${history.currentMonth.label} successful verifications / ${formatMoneyMinor(history.currentMonth.amountDueMinor, history.currentMonth.currency)} due`}
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
            <h2 className="text-section-title text-fg">Monthly verification billing</h2>
            <p className="mt-1 text-sm text-fg-subtle">Reporting timezone: {history.timezone}</p>
          </div>
          <form className="flex items-end gap-2" method="get">
            <label className="grid gap-1 text-xs font-medium text-fg-muted">
              Year
              <select
                className="h-10 rounded-md border border-border bg-surface px-3 text-sm font-normal text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                defaultValue={history.selectedYear}
                name="year"
              >
                {history.availableYears.map((year) => (
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
          <table className="w-full text-center text-body">
            <thead className="border-b border-border">
              <tr className="whitespace-nowrap text-caption uppercase tracking-wide text-fg-subtle">
                <th className="px-5 py-3 font-medium">Month</th>
                <th className="px-5 py-3 font-medium">Successful verifications</th>
                <th className="px-5 py-3 font-medium">Amount due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {history.months.map((month) => (
                <tr className="transition hover:bg-surface-muted/60" key={month.month}>
                  <td className="px-5 py-3 font-medium text-fg">{month.rowLabel}</td>
                  <td className="px-5 py-3 tabular-nums text-fg-muted">
                    {month.successfulVerifications}
                  </td>
                  <td className="px-5 py-3 font-medium tabular-nums text-fg">
                    {formatMoneyMinor(month.amountDueMinor, month.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
