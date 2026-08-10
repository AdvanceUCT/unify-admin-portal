/**
 * @fileoverview Renders the authenticated administrator page at `/credentials/issuance/batch`.
 * @module app/(admin)/credentials/issuance/batch/page
 */

import { BatchIssuancePanel } from "@/features/credentials/BatchIssuancePanel";
import { NoActiveSchemaBanner } from "@/features/credentials/NoActiveSchemaBanner";
import { getBatchIssuancePreview, getStudents } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";
import { getActiveCredentialSchema } from "@/lib/university/credentialSchema";
import { getUniversityProfile } from "@/lib/university/profile";

function programmesByFacultyFrom(students: Awaited<ReturnType<typeof getStudents>>) {
  const programmesByFaculty: Record<string, string[]> = {};

  for (const student of students) {
    const { faculty, programme } = student.credential;
    if (!faculty || !programme) continue;
    const programmes = (programmesByFaculty[faculty] ??= []);
    if (!programmes.includes(programme)) {
      programmes.push(programme);
    }
  }

  return programmesByFaculty;
}

export default async function BatchIssuePage() {
  await requireRole(["SUPER_ADMIN", "ADMIN", "ISSUER"]);

  const profile = await getUniversityProfile();
  const activeSchema = profile ? await getActiveCredentialSchema(profile.id) : null;
  const [preview, students] = await Promise.all([getBatchIssuancePreview(), getStudents()]);
  const programmesByFaculty = programmesByFacultyFrom(students);

  return (
    <div className="space-y-6">
      {!activeSchema ? <NoActiveSchemaBanner /> : null}
      <BatchIssuancePanel preview={preview} programmesByFaculty={programmesByFaculty} />
    </div>
  );
}
