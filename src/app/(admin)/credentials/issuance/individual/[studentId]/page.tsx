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
