import { SectionHeader } from "@/components/layout/SectionHeader";
import { CredentialsTable } from "@/features/credentials/CredentialsTable";
import { getAdminState } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";

export default async function CredentialsPage() {
  await requireRole(["SUPER_ADMIN", "ADMIN", "ISSUER"]);

  const initialState = await getAdminState();

  return (
    <div className="space-y-6">
      <SectionHeader title="Credentials" description="Student VC lifecycle records from the simulated cohort." />
      <CredentialsTable initialState={initialState} />
    </div>
  );
}
