import { SectionHeader } from "@/components/layout/SectionHeader";
import { AuditTable } from "@/features/audit/AuditTable";
import { getAdminState } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";

export default async function AuditPage() {
  await requireRole(["SUPER_ADMIN", "ADMIN", "VIEWER"]);

  const initialState = await getAdminState();

  return (
    <div className="space-y-6">
      <SectionHeader title="Audit log" description="Credential, vendor, verification, and simulated payment events." />
      <AuditTable initialState={initialState} />
    </div>
  );
}
