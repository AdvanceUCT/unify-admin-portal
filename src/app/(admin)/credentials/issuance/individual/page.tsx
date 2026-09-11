/**
 * @fileoverview Renders the authenticated administrator page at `/credentials/issuance/individual`.
 * @module app/(admin)/credentials/issuance/individual/page
 */

import { Suspense } from "react";

import { NoActiveSchemaBanner } from "@/features/credentials/NoActiveSchemaBanner";
import { IndividualIssuanceSearch } from "@/features/credentials/IndividualIssuanceSearch";
import { getStudents } from "@/lib/api/server";
import { requireRoleForRender } from "@/lib/auth/session";
import { getActiveCredentialSchema } from "@/lib/university/credentialSchema";
import { getUniversityProfileForRender } from "@/lib/university/profile";

export default async function IndividualIssuancePage() {
  await requireRoleForRender(["SUPER_ADMIN", "ADMIN", "ISSUER"]);

  const profilePromise = getUniversityProfileForRender();
  const [activeSchema, students] = await Promise.all([
    profilePromise.then((profile) => profile ? getActiveCredentialSchema(profile.id) : null),
    getStudents(),
  ]);

  return (
    <div className="space-y-6">
      {!activeSchema ? <NoActiveSchemaBanner /> : null}
      <Suspense>
        <IndividualIssuanceSearch students={students} />
      </Suspense>
    </div>
  );
}
