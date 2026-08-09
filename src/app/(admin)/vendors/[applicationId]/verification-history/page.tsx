import { notFound } from "next/navigation";

import { BackButton } from "@/components/ui/BackButton";
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
        />
        <Metric
          label="All time"
          value={history.allTimeSuccessfulVerifications}
          detail="Successful verifications processed"
        />
      </div>

      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-section-title text-fg">Monthly successful verifications</h2>
          <p className="mt-1 text-sm text-fg-subtle">Reporting timezone: {history.timezone}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-center text-body">
            <thead className="border-b border-border">
              <tr className="whitespace-nowrap text-caption uppercase tracking-wide text-fg-subtle">
                <th className="px-5 py-3 font-medium">Month</th>
                <th className="px-5 py-3 font-medium">Successful verifications</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {history.months.map((month) => (
                <tr className="transition hover:bg-surface-muted/60" key={month.month}>
                  <td className="px-5 py-3 font-medium text-fg">{month.label}</td>
                  <td className="px-5 py-3 tabular-nums text-fg-muted">
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
