import { Badge } from "@/components/ui/Badge";
import type { ActivationDelivery, CredentialLifecycleState, StudentRecord } from "@/lib/api/types";
import { formatCredentialStatus, formatDateTime } from "@/lib/formatters";
import { StudentCredentialActions } from "@/features/students/StudentCredentialActions";

function credentialTone(state: CredentialLifecycleState) {
  if (state === "Active") return "success";
  if (state === "Suspended" || state === "Offered" || state === "Pending" || state === "Issuing") return "warning";
  if (state === "Revoked" || state === "Expired") return "danger";
  return "neutral";
}

export function StudentCredentialIssueView({
  delivery,
  student,
}: {
  delivery?: ActivationDelivery;
  student: StudentRecord;
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="mb-4 text-base font-semibold text-zinc-950">Credential</h2>
        <dl className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-zinc-500">Lifecycle</dt>
            <dd>
              <Badge tone={credentialTone(student.credential.lifecycleState)}>
                {formatCredentialStatus(student.credential.lifecycleState)}
              </Badge>
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
        <StudentCredentialActions delivery={delivery} student={student} />
      </div>
    </section>
  );
}
