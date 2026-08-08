import { PageTabs } from "@/components/layout/PageTabs";
import { StatusText } from "@/components/ui/StatusText";
import { CredentialAuditLogTable } from "@/features/audit/CredentialAuditLogTable";
import { DecisionNoteButton } from "@/features/audit/DecisionNoteButton";
import { StudentImportAuditLogTable } from "@/features/audit/StudentImportAuditLogTable";
import { requireRole } from "@/lib/auth/session";
import { getPaginatedCredentialOfferSentAuditLogs } from "@/lib/credentials/audit";
import { getPaginatedStudentImportAuditLogs } from "@/lib/imports/audit";
import { listDecidedVendorApplications } from "@/lib/vendors/applications";

const CREDENTIAL_AUDIT_PAGE_SIZE = 25;
const STUDENT_IMPORT_AUDIT_PAGE_SIZE = 25;

function parsePage(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(rawValue ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function decisionDate(value: Date | string) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ credentialPage?: string | string[]; importPage?: string | string[]; tab?: string }>;
}) {
  await requireRole(["SUPER_ADMIN", "ADMIN", "VIEWER"]);

  const params = await searchParams;
  const activeTab =
    params.tab === "vendors" ? "vendors" : params.tab === "imports" ? "imports" : "credentials";

  const [credentialLogs, decidedVendorApplications, studentImportLogs] = await Promise.all([
    getPaginatedCredentialOfferSentAuditLogs({
      page: parsePage(params.credentialPage),
      pageSize: CREDENTIAL_AUDIT_PAGE_SIZE,
    }),
    listDecidedVendorApplications(),
    getPaginatedStudentImportAuditLogs({
      page: parsePage(params.importPage),
      pageSize: STUDENT_IMPORT_AUDIT_PAGE_SIZE,
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageTabs
        tabs={[
          { href: "/audit", isActive: activeTab === "credentials", label: "Credential logs" },
          {
            href: "/audit?tab=vendors",
            isActive: activeTab === "vendors",
            label: "Vendor decisions",
          },
          { href: "/audit?tab=imports", isActive: activeTab === "imports", label: "Import logs" },
        ]}
      />

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
        <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-section-title text-fg">Vendor application decisions</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-center text-body">
              <thead className="border-b border-border">
                <tr className="whitespace-nowrap text-caption uppercase tracking-wide text-fg-subtle">
                  <th className="px-5 py-3 font-medium">Company</th>
                  <th className="px-5 py-3 font-medium">Category</th>
                  <th className="px-5 py-3 font-medium">Decision</th>
                  <th className="px-5 py-3 font-medium">Decided by</th>
                  <th className="px-5 py-3 font-medium">Notes</th>
                  <th className="px-5 py-3 font-medium">Decided</th>
                  <th className="px-5 py-3 font-medium">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {decidedVendorApplications.length === 0 ? (
                  <tr>
                    <td className="px-5 py-10 text-fg-subtle" colSpan={7}>
                      No vendor application decisions have been made yet.
                    </td>
                  </tr>
                ) : (
                  decidedVendorApplications.map((application) => (
                    <tr className="transition hover:bg-surface-muted/60" key={application.id}>
                      <td className="px-5 py-4">
                        <div className="font-medium text-fg">{application.companyName}</div>
                        {application.companyRegistrationNumber && (
                          <div className="text-xs text-fg-subtle">
                            Reg. {application.companyRegistrationNumber}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4 text-fg-muted">{application.serviceCategory}</td>
                      <td className="px-5 py-4">
                        {application.status === "APPROVED" ? (
                          <StatusText tone="success">Approved</StatusText>
                        ) : application.status === "REVOKED" ? (
                          <StatusText tone="warning">Revoked</StatusText>
                        ) : (
                          <StatusText tone="danger">Rejected</StatusText>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-fg-muted">
                        {application.decisionActorName ?? (
                          <span className="text-fg-subtle">Unknown</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {application.decisionNotes ? (
                          <DecisionNoteButton
                            companyName={application.companyName}
                            note={application.decisionNotes}
                          />
                        ) : (
                          <span className="text-fg-subtle">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 tabular-nums text-fg-muted">
                        {application.decisionAt ? (
                          decisionDate(application.decisionAt)
                        ) : (
                          <span className="text-fg-subtle">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 tabular-nums text-fg-muted">
                        {decisionDate(application.createdAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === "imports" && (
        <StudentImportAuditLogTable
          logs={studentImportLogs.logs}
          page={studentImportLogs.page}
          pageSize={studentImportLogs.pageSize}
          totalCount={studentImportLogs.totalCount}
          totalPages={studentImportLogs.totalPages}
        />
      )}
    </div>
  );
}
