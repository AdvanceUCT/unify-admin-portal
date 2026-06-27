import Link from "next/link";

import { SectionHeader } from "@/components/layout/SectionHeader";
import { Badge } from "@/components/ui/Badge";
import { CredentialAuditLogTable } from "@/features/audit/CredentialAuditLogTable";
import { requireRole } from "@/lib/auth/session";
import { getPaginatedCredentialOfferSentAuditLogs } from "@/lib/credentials/audit";
import { listDecidedVendorApplications } from "@/lib/vendors/applications";

const CREDENTIAL_AUDIT_PAGE_SIZE = 25;

function parsePage(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(rawValue ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ credentialPage?: string | string[]; tab?: string }>;
}) {
  await requireRole(["SUPER_ADMIN", "ADMIN", "VIEWER"]);

  const params = await searchParams;
  const activeTab = params.tab === "vendors" ? "vendors" : "credentials";

  const [credentialLogs, decidedVendorApplications] = await Promise.all([
    getPaginatedCredentialOfferSentAuditLogs({
      page: parsePage(params.credentialPage),
      pageSize: CREDENTIAL_AUDIT_PAGE_SIZE,
    }),
    listDecidedVendorApplications(),
  ]);

  return (
    <div className="space-y-6">
      <SectionHeader title="Logs" description="Credential and portal accountability logs." />

      <div className="border-b border-zinc-200">
        <nav aria-label="Log views" className="-mb-px flex gap-6">
          <Link
            href="/audit"
            className={`border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
              activeTab === "credentials"
                ? "border-zinc-950 text-zinc-950"
                : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700"
            }`}
          >
            Credential logs
          </Link>
          <Link
            href="/audit?tab=vendors"
            className={`border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
              activeTab === "vendors"
                ? "border-zinc-950 text-zinc-950"
                : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700"
            }`}
          >
            Vendor decisions
            {decidedVendorApplications.length > 0 && (
              <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                {decidedVendorApplications.length}
              </span>
            )}
          </Link>
        </nav>
      </div>

      {activeTab === "credentials" && (
        <CredentialAuditLogTable
          logs={credentialLogs.logs}
          page={credentialLogs.page}
          pageSize={credentialLogs.pageSize}
          totalCount={credentialLogs.totalCount}
          totalPages={credentialLogs.totalPages}
        />
      )}

      {activeTab === "vendors" && (
        <section className="rounded-lg border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 px-5 py-4">
            <h2 className="text-base font-semibold text-zinc-950">Vendor application decisions</h2>
            <p className="mt-0.5 text-sm text-zinc-500">
              All approved and rejected vendor applications, ordered by review date.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-xs font-medium uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-5 py-3">Company</th>
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3">Decision</th>
                  <th className="px-5 py-3">Reviewed by</th>
                  <th className="px-5 py-3">Notes</th>
                  <th className="px-5 py-3">Decided</th>
                  <th className="px-5 py-3">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {decidedVendorApplications.length === 0 ? (
                  <tr>
                    <td className="px-5 py-12 text-center text-sm text-zinc-500" colSpan={7}>
                      No vendor application decisions have been made yet.
                    </td>
                  </tr>
                ) : (
                  decidedVendorApplications.map((application) => (
                    <tr key={application.id}>
                      <td className="px-5 py-4">
                        <div className="font-medium text-zinc-950">
                          {application.vendorProfile.companyName}
                        </div>
                        {application.companyRegistrationNumber && (
                          <div className="text-xs text-zinc-400">
                            Reg. {application.companyRegistrationNumber}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4 text-zinc-600">
                        {application.vendorProfile.serviceCategory}
                      </td>
                      <td className="px-5 py-4">
                        {application.status === "APPROVED" ? (
                          <Badge tone="success">Approved</Badge>
                        ) : (
                          <Badge tone="danger">Rejected</Badge>
                        )}
                      </td>
                      <td className="px-5 py-4 text-zinc-600">
                        {application.reviewerName ?? (
                          <span className="text-zinc-400">Unknown</span>
                        )}
                      </td>
                      <td className="max-w-xs px-5 py-4 text-zinc-600">
                        {application.reviewNotes ? (
                          <span className="line-clamp-2">{application.reviewNotes}</span>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-zinc-500">
                        {application.reviewedAt
                          ? new Date(application.reviewedAt).toLocaleDateString("en-GB", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                          : <span className="text-zinc-400">—</span>}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-zinc-500">
                        {new Date(application.createdAt).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
