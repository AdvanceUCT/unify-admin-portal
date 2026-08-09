import { Badge } from "@/components/ui/Badge";
import type { ActivationDelivery, StudentRecord } from "@/lib/api/types";
import { credentialStatusTone, formatCredentialStatus, formatDateTime } from "@/lib/formatters";
import { StudentCredentialActions } from "@/features/students/StudentCredentialActions";
import { humanizeFieldName } from "@/lib/imports/mapping";

function FactRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-caption font-medium uppercase tracking-wide text-fg-subtle">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-fg">{value}</dd>
    </div>
  );
}

export function StudentCredentialIssueView({
  delivery,
  student,
}: {
  delivery?: ActivationDelivery;
  student: StudentRecord;
}) {
  const customAttributes = Object.entries(student.credential.attributes ?? {}).filter(
    (entry): entry is [string, string] => entry[1] != null,
  );

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[18rem_1fr]">
      {/* Identity + credential facts — static context, kept visually separate
          from the interactive actions in the main column. */}
      <aside className="space-y-4 rounded-xl border border-border bg-surface p-5 shadow-md lg:sticky lg:top-6">
        <div>
          <h1 className="text-xl font-semibold text-fg">
            {student.profile.firstName} {student.profile.lastName}
          </h1>
          <p className="mt-1 text-sm text-fg-subtle">
            {student.profile.institution} • {student.credential.studentNumber}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={credentialStatusTone(student.credential.lifecycleState)}>
            {formatCredentialStatus(student.credential.lifecycleState)}
          </Badge>
          {student.credential.schemaVersion ? (
            <Badge tone="version">v{student.credential.schemaVersion}</Badge>
          ) : null}
        </div>

        <dl className="space-y-4 border-t border-border pt-4">
          <FactRow label="Faculty" value={student.credential.faculty ?? "—"} />
          <FactRow label="Programme" value={student.credential.programme} />
          <FactRow label="Valid from" value={formatDateTime(student.credential.validFrom)} />
          <FactRow label="Expires" value={formatDateTime(student.credential.expiresAt)} />
        </dl>

        {/* Custom import fields — university-specific attributes beyond the
            fixed platform fields. Lives with the rest of the static facts
            rather than a separate panel, and grows automatically as more
            fields get mapped during CSV import: nothing here is hard-coded
            to a fixed set of columns. */}
        {customAttributes.length > 0 ? (
          <div className="space-y-4 border-t border-border pt-4">
            <p className="text-caption font-semibold uppercase tracking-wide text-fg-subtle">
              Additional information
            </p>
            <dl className="space-y-4">
              {customAttributes.map(([key, value]) => (
                <FactRow key={key} label={humanizeFieldName(key)} value={value} />
              ))}
            </dl>
          </div>
        ) : null}
      </aside>

      <div className="min-w-0 space-y-6">
        <StudentCredentialActions delivery={delivery} student={student} />
      </div>
    </div>
  );
}
