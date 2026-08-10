/**
 * @fileoverview Renders the authenticated administrator page at `/students/[studentId]`.
 * @module app/(admin)/students/[studentId]/page
 */

import { StudentCredentialDetailPage } from "@/features/students/StudentCredentialDetailPage";

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;

  return <StudentCredentialDetailPage backHref="/students" backLabel="Back to students" studentId={studentId} />;
}
