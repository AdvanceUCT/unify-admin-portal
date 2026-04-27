import { SectionHeader } from "@/components/layout/SectionHeader";
import { CredentialsTable } from "@/features/credentials/CredentialsTable";
import { getAdminState } from "@/lib/api/client";

export default async function CredentialsPage() {
  const initialState = await getAdminState();

  return (
    <div className="space-y-6">
      <SectionHeader title="Credentials" description="Student VC lifecycle records from the simulated cohort." />
      <CredentialsTable initialState={initialState} />
    </div>
  );
}
