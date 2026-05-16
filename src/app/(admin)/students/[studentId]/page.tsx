import { notFound } from "next/navigation";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { StudentCredentialIssueView } from "@/features/students/StudentCredentialIssueView";
import { getStudentById } from "@/lib/api/client";
import { getActivationDeliveryByCredentialId } from "@/lib/api/server";
import { requireRole } from "@/lib/auth/session";

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  await requireRole(["SUPER_ADMIN", "ADMIN", "ISSUER"]);

  const { studentId } = await params;
  const student = await getStudentById(studentId);

  if (!student) {
    notFound();
  }

  const delivery = await getActivationDeliveryByCredentialId(student.credential.id);

  return (
    <div className="space-y-6">
      <SectionHeader title={`${student.profile.firstName} ${student.profile.lastName}`} description={student.profile.institution} />
      <StudentCredentialIssueView delivery={delivery} student={student} />
    </div>
  );
}
