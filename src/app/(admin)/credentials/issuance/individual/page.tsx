import { Suspense } from "react";

import { SectionHeader } from "@/components/layout/SectionHeader";
import { IndividualIssuanceSearch } from "@/features/credentials/IndividualIssuanceSearch";
import { getStudents } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";

export default async function IndividualIssuancePage() {
  await requireRole(["SUPER_ADMIN", "ADMIN", "ISSUER"]);

  const students = await getStudents();

  return (
    <div className="space-y-6">
      <SectionHeader title="Individual issue" description="Search for a student before issuing their credential." />
      <Suspense>
        <IndividualIssuanceSearch students={students} />
      </Suspense>
    </div>
  );
}
