import { SectionHeader } from "@/components/layout/SectionHeader";
import { CredentialAuditLogTable } from "@/features/audit/CredentialAuditLogTable";
import { requireRole } from "@/lib/auth/session";
import { getPaginatedCredentialOfferSentAuditLogs } from "@/lib/credentials/audit";

const CREDENTIAL_AUDIT_PAGE_SIZE = 25;

function parsePage(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(rawValue ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ credentialPage?: string | string[] }>;
}) {
  await requireRole(["SUPER_ADMIN", "ADMIN", "VIEWER"]);

  const params = await searchParams;
  const credentialLogs = await getPaginatedCredentialOfferSentAuditLogs({
    page: parsePage(params.credentialPage),
    pageSize: CREDENTIAL_AUDIT_PAGE_SIZE,
  });

  return (
    <div className="space-y-6">
      <SectionHeader title="Logs" description="Credential and portal accountability logs." />

      <div className="border-b border-zinc-200">
        <nav aria-label="Log views" className="-mb-px flex gap-6">
          <span className="border-b-2 border-zinc-950 px-1 pb-3 text-sm font-medium text-zinc-950">
            Credential logs
          </span>
        </nav>
      </div>

      <CredentialAuditLogTable
        logs={credentialLogs.logs}
        page={credentialLogs.page}
        pageSize={credentialLogs.pageSize}
        totalCount={credentialLogs.totalCount}
        totalPages={credentialLogs.totalPages}
      />
    </div>
  );
}
