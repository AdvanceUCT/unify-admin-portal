import Link from "next/link";
import { notFound } from "next/navigation";

import { SectionHeader } from "@/components/layout/SectionHeader";
import { StudentCredentialIssueView } from "@/features/students/StudentCredentialIssueView";
import { getStudentById } from "@/lib/api/client";
import { getActivationDeliveryByCredentialId } from "@/lib/api/server";
import { requireRole } from "@/lib/auth/session";

export default async function IndividualIssuanceStudentPage({
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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionHeader
          title={`${student.profile.firstName} ${student.profile.lastName}`}
          description={`${student.profile.institution} | ${student.credential.studentNumber}`}
        />
        <Link
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          href="/credentials/issuance/individual"
        >
          Back to search
        </Link>
      </div>
      <StudentCredentialIssueView delivery={delivery} student={student} />
    </div>
  );
}
