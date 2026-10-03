/**
 * @fileoverview Shows one student's credential, delivery, and lifecycle history.
 * @module features/students/StudentCredentialDetailPage
 */

import { studentRenewalEnrolment } from "@/lib/credentials/renewalOverview";
import { RenewalAction } from "@/features/credentials/RenewalAction";
import { formatAcademicDateTime as formatDateTime } from "@/lib/formatters";
import { notFound } from "next/navigation";

import { BackButton } from "@/components/ui/BackButton";
import { StudentCredentialIssueView } from "@/features/students/StudentCredentialIssueView";
import {
  getActivationDeliveryByCredentialId,
  getStudentById,
} from "@/lib/api/server";
import { requireRoleForRender } from "@/lib/auth/session";

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
  const session = await requireRoleForRender([
    "SUPER_ADMIN",
    "ADMIN",
    "ISSUER",
  ]);

  const student = await getStudentById(studentId);

  if (!student) {
    notFound();
  }

  const enrolment = await studentRenewalEnrolment([
    student.profile.id,
    student.credential.studentNumber,
  ]);
  const next = enrolment?.records.find((record) =>
    ["SCHEDULED", "DEFERRED", "RETRYING", "PROCESSING"].includes(record.status),
  );
  const delivery = await getActivationDeliveryByCredentialId(
    student.credential.id,
  );

  return (
    <div className="space-y-6">
      <BackButton href={backHref} label={backLabel} />
      {enrolment && (
        <section className="rounded-xl border border-border p-5">
          <h2 className="font-semibold">Auto-renewal</h2>
          <p>
            Status: {enrolment.status.toLowerCase()}. Final academic year:{" "}
            {enrolment.finalYear}.
          </p>
          {next && enrolment.status === "ACTIVE" && (
            <p>Next renewal: {formatDateTime(next.dueAt.toISOString())}.</p>
          )}
          {enrolment.cancelledAt && (
            <p>
              Cancelled {formatDateTime(enrolment.cancelledAt.toISOString())} by{" "}
              {enrolment.cancelledBy}.
            </p>
          )}
          {!!enrolment.cancellations.length && (
            <details>
              <summary>Cancellation history</summary>
              {enrolment.cancellations.map((cancellation) => (
                <p key={cancellation.id}>
                  {formatDateTime(cancellation.cancelledAt!.toISOString())} by{" "}
                  {cancellation.cancelledBy}; final academic year{" "}
                  {cancellation.finalYear}.
                </p>
              ))}
            </details>
          )}
          {enrolment.status === "ACTIVE" &&
            ["SUPER_ADMIN", "ADMIN"].includes(session.user.role ?? "") && (
              <RenewalAction
                id={enrolment.id}
                action="cancel"
                label="Cancel auto-renewal"
              />
            )}
        </section>
      )}
      <StudentCredentialIssueView
        delivery={delivery}
        student={student}
        existingFinalYear={
          enrolment?.status === "ACTIVE" ? enrolment.finalYear : undefined
        }
      />
    </div>
  );
}
