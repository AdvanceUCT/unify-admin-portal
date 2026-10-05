import Link from "next/link";
import { ArrowRight, CalendarClock } from "lucide-react";
import { PageTabs } from "@/components/layout/PageTabs";
import { StatusText } from "@/components/ui/StatusText";
import { RenewalAction } from "@/features/credentials/RenewalAction";
import { RenewalFilters } from "@/features/credentials/RenewalFilters";
import { requireRoleForRender } from "@/lib/auth/session";
import { renewalOverview } from "@/lib/credentials/renewalOverview";
import { getStudentProgrammesByFaculty } from "@/lib/students/repository";
import { formatAcademicDateTime } from "@/lib/formatters";
import { formatRenewalDate, renewalStatusLabel } from "@/lib/credentials/renewalPresentation";

const basePath = "/credentials/issuance/renewals";
const secondaryButton = "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg";
const label = renewalStatusLabel;
function outcomeLabel(status: string) {
  return status === "AWAITING_ACTIVATION" ? "Offer sent" : status === "ACTIVATED" ? "Renewed" : label(status);
}
function tone(status: string) {
  return status === "FAILED" || status === "NEEDS_ATTENTION" ? "danger" as const
    : status === "ACTIVATED" || status === "SUCCEEDED" ? "success" as const
    : status === "DEFERRED" || status === "RETRYING" ? "warning" as const : "neutral" as const;
}
export default async function RenewalsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireRoleForRender(["SUPER_ADMIN", "ADMIN", "ISSUER"]);
  const raw = await searchParams;
  const params = Object.fromEntries(Object.entries(raw).flatMap(([key, value]) => typeof value === "string" ? [[key, value]] : []));
  const view = params.view === "history" ? "history" : params.year || params.view === "upcoming" || params.view === "attention" ? "upcoming" : "summary";
  const [data, programmesByFaculty] = await Promise.all([
    renewalOverview({ ...params, view }),
    view === "summary" ? Promise.resolve({}) : getStudentProgrammesByFaculty(),
  ]);
  const isPeriodDetail = view !== "history" && Boolean(params.year && params.periodStart && params.periodExpiry);
  const canManage = ["SUPER_ADMIN", "ADMIN"].includes(session.user.role ?? "");
  const href = (values: Record<string, string>) => `${basePath}?${new URLSearchParams(values)}`;
  const periods = new Map<string, { academicYear: number; dueAt: Date; expiresAt: Date; count: number; suspended: number; overdue: number; attention: number }>();
  for (const group of data.periods) {
    const key = `${group.academicYear}:${group.dueAt.toISOString()}:${group.expiresAt.toISOString()}`;
    const period = periods.get(key) ?? { ...group, count: 0, suspended: 0, overdue: 0, attention: 0 };
    period.count += group.count;
    if (group.status === "DEFERRED") period.suspended += group.count;
    if (["FAILED", "NEEDS_ATTENTION"].includes(group.status)) period.attention += group.count;
    if (["SCHEDULED", "RETRYING", "PROCESSING"].includes(group.status) && group.dueAt <= data.asOf && group.expiresAt > data.asOf) period.overdue += group.count;
    periods.set(key, period);
  }
  return <div className="space-y-6">
    <PageTabs ariaLabel="Renewal views" tabs={[
      { label: "Renewal periods", href: basePath, isActive: view !== "history" },
      { label: "History", href: href({ view: "history" }), isActive: view === "history" },
    ]} />
    {view === "summary" ? <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
      <div className="border-b border-border px-6 py-5">
        <h2 className="flex items-center gap-2 text-section-title text-fg"><CalendarClock aria-hidden className="size-5 text-brand-600" />Queued renewal periods</h2>
        <p className="mt-1 text-sm text-fg-muted">Select an academic period to review its students and manage renewals.</p>
      </div>
      <div className="divide-y divide-border">
        {[...periods.values()].map((period) => <Link key={`${period.academicYear}:${period.dueAt.toISOString()}:${period.expiresAt.toISOString()}`}
          href={href({ view: "upcoming", year: String(period.academicYear), periodStart: period.dueAt.toISOString(), periodExpiry: period.expiresAt.toISOString() })}
          className="group block px-6 py-6 transition hover:bg-surface-muted/60 focus-visible:outline-2 focus-visible:outline-brand-500">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-lg font-semibold text-fg">Academic year {period.academicYear}</h3>
            <span className="inline-flex items-center gap-2 text-sm font-medium text-brand-700">View students<ArrowRight aria-hidden className="size-4 transition group-hover:translate-x-1" /></span>
          </div>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
            <div><dt className="text-fg-subtle">Renewal date</dt><dd className="mt-1 font-medium text-fg">{formatRenewalDate(period.dueAt)}</dd></div>
            <div><dt className="text-fg-subtle">Valid through</dt><dd className="mt-1 font-medium text-fg">{formatRenewalDate(period.expiresAt, true)}</dd></div>
            <div><dt className="text-fg-subtle">Students queued</dt><dd className="mt-1 font-medium tabular-nums text-fg">{period.count}</dd></div>
            <div><dt className="text-fg-subtle">Overdue</dt><dd className={`mt-1 font-medium tabular-nums ${period.overdue ? "text-warning-fg" : "text-fg"}`}>{period.overdue}</dd></div>
            <div><dt className="text-fg-subtle">Suspended</dt><dd className="mt-1 font-medium tabular-nums text-fg">{period.suspended}</dd></div>
            <div><dt className="text-fg-subtle">Needs attention</dt><dd className={`mt-1 font-medium tabular-nums ${period.attention ? "text-danger-fg" : "text-fg"}`}>{period.attention}</dd></div>
          </dl>
        </Link>)}
        {!periods.size && <div className="px-6 py-10 text-center"><p className="font-medium text-fg">No renewals queued</p><p className="mt-2 text-sm text-fg-muted">Enable auto-renewal during issuance to add future academic periods.</p></div>}
      </div>
    </section> : <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-section-title text-fg">{view === "history" ? "Renewal history" : params.year ? `Academic year ${params.year}` : "Queued renewals"}</h2>
          <p className="mt-1 text-sm text-fg-muted">{view === "history" ? "Previously triggered renewals and their delivery outcomes." : params.periodStart && params.periodExpiry ? `${formatRenewalDate(params.periodStart)} - ${formatRenewalDate(params.periodExpiry, true)}` : "Students scheduled for renewal."}</p></div>
        {view !== "history" && <Link href={basePath} className={secondaryButton}>Back to periods</Link>}
      </div>
      <RenewalFilters key={new URLSearchParams(params).toString()} params={{ ...params, view }} programmesByFaculty={programmesByFaculty} />
      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
          <div className="overflow-x-auto">
            <table className="w-full text-center text-body">
              <thead className="border-b border-border">
                <tr className="whitespace-nowrap text-caption uppercase tracking-wide text-fg-subtle">
                  {[
                    "Student",
                    "Faculty",
                    "Programme",
                    ...(isPeriodDetail ? [] : ["Academic year", view === "history" ? "Triggered" : "Period"]),
                    ...(view === "history" ? [] : ["Years remaining"]),
                    "Status",
                    "Actions",
                  ].map((title) => (
                    <th className="px-4 py-3 font-medium" key={title}>
                      {title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.records.map((record) => (
                  <tr
                    key={record.id}
                    className="align-middle transition hover:bg-surface-muted/60"
                  >
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex flex-col items-center gap-0.5">
                        <Link className="font-medium text-brand-700 hover:underline"
                          href={`/students/${encodeURIComponent(record.student?.id ?? record.enrolment.studentId)}`}>
                          {record.student ? `${record.student.firstName} ${record.student.lastName}` : record.enrolment.studentId}
                        </Link>
                        {record.student?.studentNumber && <span className="text-xs tabular-nums text-fg-subtle">{record.student.studentNumber}</span>}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-fg-muted">{record.student?.faculty ?? "-"}</td>
                    <td className="px-4 py-3 text-sm text-fg-muted"><span className="mx-auto block max-w-64 truncate" title={record.student?.programme ?? undefined}>{record.student?.programme ?? "-"}</span></td>
                    {!isPeriodDetail && <>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-fg">{record.academicYear}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-fg-muted">
                        {view === "history" ? record.triggeredAt ? formatAcademicDateTime(record.triggeredAt.toISOString()) : "-" : `${formatRenewalDate(record.dueAt)} - ${formatRenewalDate(record.expiresAt, true)}`}
                      </td>
                    </>}
                    {view !== "history" && <td className="whitespace-nowrap px-4 py-3 text-sm tabular-nums text-fg-muted">{record.remainingYears}</td>}
                    <td className="whitespace-nowrap px-4 py-3">
                      <StatusText tone={tone(record.status)}>
                        {record.status === "DEFERRED" ||
                        (view !== "history" && record.suspended)
                          ? "Suspended"
                          : ["SCHEDULED", "RETRYING", "PROCESSING"].includes(record.status) &&
                              record.dueAt <= data.asOf && record.expiresAt > data.asOf
                            ? "Overdue"
                            : record.status === "AWAITING_ACTIVATION" && !record.deliveredAt ? "Offer created" : outcomeLabel(record.status)}
                      </StatusText>
                      {(record.lastError || record.attempts.length > 0) && (
                        <details className="mt-2 text-xs">
                          <summary className="cursor-pointer text-brand-700">
                            View details
                          </summary>
                          <div className="mx-auto mt-2 max-w-xs space-y-2 whitespace-normal">
                            <p className="text-fg-subtle">
                              {record.attemptCount} processing attempts
                            </p>
                            {record.lastError && (
                              <p className="break-words text-danger-fg">
                                {record.lastError}
                              </p>
                            )}
                            {record.deliveredAt && (
                              <p>
                                Delivered{" "}
                                {formatAcademicDateTime(
                                  record.deliveredAt.toISOString(),
                                )}
                              </p>
                            )}
                            {record.attempts.map((attempt) => (
                              <div
                                key={attempt.id}
                                className="border-t border-border pt-2"
                              >
                                <p>
                                  Prepared{" "}
                                  {formatAcademicDateTime(
                                    attempt.createdAt.toISOString(),
                                  )}
                                </p>
                                <p>
                                  {formatRenewalDate(attempt.validFrom)} -{" "}
                                  {formatRenewalDate(attempt.expiresAt, true)}
                                </p>
                                <p>
                                  Delivery:{" "}
                                  {outcomeLabel(
                                    attempt.issuance?.deliveryStatus ??
                                      "PENDING",
                                  )}
                                </p>
                                {attempt.issuance?.failureReason && (
                                  <p>{attempt.issuance.failureReason}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        {canManage &&
                          record.status === "FAILED" &&
                          record.expiresAt > data.asOf && (
                            <RenewalAction
                              id={record.id}
                              action="retry"
                              label="Retry"
                            />
                          )}
                        {canManage &&
                          record.status === "NEEDS_ATTENTION" &&
                          record.expiresAt > data.asOf && (
                            <RenewalAction
                              id={record.id}
                              action="replace"
                              label="Replace offer"
                            />
                          )}
                        {canManage && record.enrolment.status === "ACTIVE" && (
                          <RenewalAction
                            id={record.enrolmentId}
                            action="cancel"
                            label="Cancel"
                          />
                        )}
                        {!canManage && (
                          <span className="text-xs text-fg-subtle">
                            View only
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.records.length && (
            <p className="px-5 py-8 text-center text-sm text-fg-muted">
              No renewals match these filters.
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 text-sm">
            <p className="text-fg-subtle">
              {data.total} records / Page {data.page}
            </p>
            <div className="flex gap-2">
              {data.page > 1 && (
                <Link
                  className={secondaryButton}
                  href={href({ ...params, view, page: String(data.page - 1) })}
                >
                  Previous
                </Link>
              )}
              {data.page * 25 < data.total && (
                <Link
                  className={secondaryButton}
                  href={href({ ...params, view, page: String(data.page + 1) })}
                >
                  Next
                </Link>
              )}
            </div>
          </div>
      </section>
    </>}
  </div>;
}
