/**
 * @fileoverview Shows one student's credential, delivery, and lifecycle history.
 * @module features/students/StudentCredentialDetailPage
 */

import { studentRenewalEnrolment } from "@/lib/credentials/renewalOverview";
import { StatusText } from "@/components/ui/StatusText";
import { formatRenewalDate, renewalStatusLabel } from "@/lib/credentials/renewalPresentation";
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
      <StudentCredentialIssueView
        delivery={delivery}
        student={student}
        existingFinalYear={
          enrolment?.status === "ACTIVE" ? enrolment.finalYear : undefined
        }
      />
      {enrolment && (
        <section className="rounded-xl border border-border bg-surface p-5 shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-section-title text-fg">Auto-renewal</h2>
          <StatusText tone={enrolment.status === "ACTIVE" ? "success" : "neutral"}>{renewalStatusLabel(enrolment.status)}</StatusText>
          </div>
          <dl className="mt-4 flex flex-wrap gap-x-10 gap-y-3 text-sm">
            <div><dt className="text-fg-subtle">Final academic year</dt><dd className="mt-1 font-medium text-fg">{enrolment.finalYear}</dd></div>
          {next && enrolment.status === "ACTIVE" && (
            <div><dt className="text-fg-subtle">Next renewal</dt><dd className="mt-1 font-medium text-fg">{formatRenewalDate(next.dueAt)}</dd></div>
          )}
          </dl>
          {enrolment.cancelledAt && (
            <p className="mt-3 text-sm text-fg-muted">
              Cancelled {formatDateTime(enrolment.cancelledAt.toISOString())} by{" "}
              {enrolment.cancelledBy}.
            </p>
          )}
          {!!enrolment.cancellations.length && (
            <details className="mt-3 text-xs text-fg-muted">
              <summary className="cursor-pointer font-medium text-brand-700">Cancellation history</summary>
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
              <div className="mt-4 border-t border-border pt-3"><RenewalAction
                id={enrolment.id}
                action="cancel"
                label="Cancel auto-renewal"
              /></div>
            )}
        </section>
      )}

    </div>
  );
}
