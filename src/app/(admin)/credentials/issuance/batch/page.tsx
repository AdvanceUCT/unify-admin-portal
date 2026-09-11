/**
 * @fileoverview Renders the authenticated administrator page at `/credentials/issuance/batch`.
 * @module app/(admin)/credentials/issuance/batch/page
 */

import { BatchIssuancePanel } from "@/features/credentials/BatchIssuancePanel";
import { NoActiveSchemaBanner } from "@/features/credentials/NoActiveSchemaBanner";
import { getInitialBatchIssuancePreview, getProgrammesByFaculty } from "@/lib/api/server";
import { requireRoleForRender } from "@/lib/auth/session";
import { getActiveCredentialSchema } from "@/lib/university/credentialSchema";
import { getUniversityProfileForRender } from "@/lib/university/profile";

export default async function BatchIssuePage() {
  await requireRoleForRender(["SUPER_ADMIN", "ADMIN", "ISSUER"]);

  const profilePromise = getUniversityProfileForRender();
  const [activeSchema, preview, programmesByFaculty] = await Promise.all([
    profilePromise.then((profile) => profile ? getActiveCredentialSchema(profile.id) : null),
    getInitialBatchIssuancePreview(),
    getProgrammesByFaculty(),
  ]);

  return (
    <div className="space-y-6">
      {!activeSchema ? <NoActiveSchemaBanner /> : null}
      <BatchIssuancePanel preview={preview} programmesByFaculty={programmesByFaculty} />
    </div>
  );
}
