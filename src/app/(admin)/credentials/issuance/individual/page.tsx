import { Suspense } from "react";

import { NoActiveSchemaBanner } from "@/features/credentials/NoActiveSchemaBanner";
import { IndividualIssuanceSearch } from "@/features/credentials/IndividualIssuanceSearch";
import { getStudents } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";
import { getActiveCredentialSchema } from "@/lib/university/credentialSchema";
import { getUniversityProfile } from "@/lib/university/profile";

export default async function IndividualIssuancePage() {
  await requireRole(["SUPER_ADMIN", "ADMIN", "ISSUER"]);

  const profile = await getUniversityProfile();
  const activeSchema = profile ? await getActiveCredentialSchema(profile.id) : null;
  const students = await getStudents();

  return (
    <div className="space-y-6">
      {!activeSchema ? <NoActiveSchemaBanner /> : null}
      <Suspense>
        <IndividualIssuanceSearch students={students} />
      </Suspense>
    </div>
  );
}
