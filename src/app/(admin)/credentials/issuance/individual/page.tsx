import { Suspense } from "react";

import { BackButton } from "@/components/ui/BackButton";
import { IndividualIssuanceSearch } from "@/features/credentials/IndividualIssuanceSearch";
import { getStudents } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";

export default async function IndividualIssuancePage() {
  await requireRole(["SUPER_ADMIN", "ADMIN", "ISSUER"]);

  const students = await getStudents();

  return (
    <div className="space-y-6">
      <BackButton href="/credentials/issuance" label="Back to issuance" />
      <Suspense>
        <IndividualIssuanceSearch students={students} />
      </Suspense>
    </div>
  );
}
