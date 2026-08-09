import { notFound } from "next/navigation";

import { BackButton } from "@/components/ui/BackButton";
import { StudentCredentialIssueView } from "@/features/students/StudentCredentialIssueView";
import { getStudentById } from "@/lib/api/client";
import { getActivationDeliveryByCredentialId } from "@/lib/api/server";
import { requireRole } from "@/lib/auth/session";

type StudentCredentialDetailPageProps = {
  backHref: string;
  backLabel: string;
  studentId: string;
};

export async function StudentCredentialDetailPage({
  backHref,
  backLabel,
  studentId,
}: StudentCredentialDetailPageProps) {
  await requireRole(["SUPER_ADMIN", "ADMIN", "ISSUER"]);

  const student = await getStudentById(studentId);

  if (!student) {
    notFound();
  }

  const delivery = await getActivationDeliveryByCredentialId(student.credential.id);

  return (
    <div className="space-y-6">
      <BackButton href={backHref} label={backLabel} />
      <StudentCredentialIssueView delivery={delivery} student={student} />
    </div>
  );
}
