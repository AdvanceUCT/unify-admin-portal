import Link from "next/link";
import { notFound } from "next/navigation";

import { SectionHeader } from "@/components/layout/SectionHeader";
import { Metric } from "@/components/ui/Metric";
import { requireRole } from "@/lib/auth/session";
import { getVendorApplicationById } from "@/lib/vendors/applications";
import { getVendorMonthlyVerificationHistory } from "@/lib/vendors/monthlyVerificationHistory";

export default async function VendorVerificationHistoryPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  await requireRole(["SUPER_ADMIN", "ADMIN"]);

  const { applicationId } = await params;
  const application = await getVendorApplicationById(applicationId);

  if (!application || application.status !== "APPROVED") {
    notFound();
  }

  const companyName =
    application.snapshotCompanyName ?? application.vendorProfile.companyName;
  const serviceCategory =
    application.snapshotServiceCategory ?? application.vendorProfile.serviceCategory;
  const history = await getVendorMonthlyVerificationHistory(application.vendorProfileId);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Verification history"
        description={`Monthly successful verification totals for ${companyName}.`}
      />

      <Link href="/vendors" className="text-sm text-zinc-500 hover:text-zinc-800">
        &larr; Back to vendors
      </Link>

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <p className="text-sm font-medium text-zinc-500">Vendor</p>
        <h2 className="mt-1 text-xl font-semibold tracking-normal text-zinc-950">
          {companyName}
        </h2>
        <p className="mt-1 text-sm text-zinc-500">{serviceCategory}</p>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Metric
          label="Current month"
          value={history.currentMonth.successfulVerifications}
          detail={`${history.currentMonth.label} successful verifications`}
        />
        <Metric
          label="All time"
          value={history.allTimeSuccessfulVerifications}
          detail="Successful verifications processed"
        />
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-950">
            Monthly successful verifications
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Reporting timezone: {history.timezone}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs font-medium uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-5 py-3">Month</th>
                <th className="px-5 py-3 text-right">Successful verifications</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {history.months.map((month) => (
                <tr key={month.month}>
                  <td className="px-5 py-3 font-medium text-zinc-900">
                    {month.label}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-zinc-700">
                    {month.successfulVerifications}
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
