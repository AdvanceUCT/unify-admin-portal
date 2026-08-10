/**
 * @fileoverview Renders the authenticated administrator page at `/credentials/issuance/individual/[studentId]`.
 * @module app/(admin)/credentials/issuance/individual/[studentId]/page
 */

import { StudentCredentialDetailPage } from "@/features/students/StudentCredentialDetailPage";

export default async function IndividualIssuanceStudentPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;

  return (
    <StudentCredentialDetailPage
      backHref="/credentials/issuance/individual"
      backLabel="Back to search"
      studentId={studentId}
    />
  );
}
