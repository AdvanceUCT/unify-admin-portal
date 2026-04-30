import { notFound } from "next/navigation";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { Badge } from "@/components/ui/Badge";
import { getStudentById } from "@/lib/api/client";
import { formatCredentialStatus, formatDateTime } from "@/lib/formatters";

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  const student = await getStudentById(studentId);

  if (!student) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <SectionHeader title={`${student.profile.firstName} ${student.profile.lastName}`} description={student.profile.institution} />
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="mb-4 text-base font-semibold text-zinc-950">Credential</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-zinc-500">Lifecycle</dt>
              <dd>
                <Badge tone="success">{formatCredentialStatus(student.credential.lifecycleState)}</Badge>
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Faculty</dt>
              <dd className="text-right text-zinc-900">{student.credential.faculty}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Programme</dt>
              <dd className="text-right text-zinc-900">{student.credential.programme}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Enrolment status</dt>
              <dd className="text-zinc-900">{student.credential.enrolmentStatus}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Student number</dt>
              <dd className="font-mono text-zinc-900">{student.credential.studentNumber}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Valid from</dt>
              <dd className="text-zinc-900">{formatDateTime(student.credential.validFrom)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Expires</dt>
              <dd className="text-zinc-900">{formatDateTime(student.credential.expiresAt)}</dd>
            </div>
          </dl>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="mb-4 text-base font-semibold text-zinc-950">Available actions</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {["Issue", "Suspend", "Reinstate", "Revoke", "Renew"].map((action) => (
              <button
                className="h-10 rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-800 transition hover:border-zinc-950"
                key={action}
                type="button"
              >
                {action}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
