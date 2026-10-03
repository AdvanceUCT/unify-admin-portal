import Link from "next/link";
import { ArrowRight, CalendarClock, Clock3 } from "lucide-react";
import { PageTabs } from "@/components/layout/PageTabs";
import { Metric } from "@/components/ui/Metric";
import { StatusText } from "@/components/ui/StatusText";
import { RenewalAction } from "@/features/credentials/RenewalAction";
import { requireRoleForRender } from "@/lib/auth/session";
import { renewalOverview } from "@/lib/credentials/renewalOverview";
import { formatAcademicDateTime } from "@/lib/formatters";
import {
  formatRenewalDate,
  renewalStatusLabel,
} from "@/lib/credentials/renewalPresentation";

const basePath = "/credentials/issuance/renewals";
const secondaryButton =
  "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg";
const inputClass =
  "h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";
const label = renewalStatusLabel;
function tone(status: string) {
  return status === "FAILED" || status === "NEEDS_ATTENTION"
    ? ("danger" as const)
    : status === "ACTIVATED" || status === "SUCCEEDED"
      ? ("success" as const)
      : status === "DEFERRED" ||
          status === "PARTIAL_FAILURE" ||
          status === "RETRYING"
        ? ("warning" as const)
        : ("neutral" as const);
}

export default async function RenewalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireRoleForRender([
    "SUPER_ADMIN",
    "ADMIN",
    "ISSUER",
  ]);
  const raw = await searchParams;
  const params = Object.fromEntries(
    Object.entries(raw).flatMap(([key, value]) =>
      typeof value === "string" ? [[key, value]] : [],
    ),
  );
  const view = ["upcoming", "history", "attention"].includes(params.view)
    ? params.view
    : "summary";
  const data = await renewalOverview({ ...params, view });
  const canManage = ["SUPER_ADMIN", "ADMIN"].includes(session.user.role ?? "");
  const href = (values: Record<string, string>) =>
    `${basePath}?${new URLSearchParams(values)}`;
  const queued = ["SCHEDULED", "DEFERRED", "RETRYING", "PROCESSING"].reduce(
    (total, status) => total + (data.counts[status] ?? 0),
    0,
  );
  const attention =
    (data.counts.FAILED ?? 0) + (data.counts.NEEDS_ATTENTION ?? 0);
  const periods = new Map<
    string,
    {
      academicYear: number;
      dueAt: Date;
      expiresAt: Date;
      count: number;
      suspended: number;
    }
  >();
  for (const group of data.periods) {
    const key = `${group.academicYear}:${group.dueAt.toISOString()}:${group.expiresAt.toISOString()}`;
    const period = periods.get(key) ?? { ...group, count: 0, suspended: 0 };
    period.count += group.count;
    if (group.status === "DEFERRED") period.suspended += group.count;
    periods.set(key, period);
  }
  const today = new Date(data.asOf.getTime() + 7200000)
    .toISOString()
    .slice(0, 10);
  const statusOptions =
    view === "attention"
      ? ["FAILED", "NEEDS_ATTENTION"]
      : view === "upcoming"
        ? ["SCHEDULED", "DEFERRED", "RETRYING", "PROCESSING"]
        : [
            "PROCESSING",
            "RETRYING",
            "AWAITING_ACTIVATION",
            "ACTIVATED",
            "FAILED",
            "NEEDS_ATTENTION",
            "SKIPPED",
            "CANCELLED",
          ];

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-body text-fg-muted">
        Track the annual renewal queue, review exceptions, and check that daily
        processing is running.
      </p>
      <PageTabs
        ariaLabel="Renewal views"
        tabs={[
          { label: "Operations", value: "summary" },
          { label: "Upcoming", value: "upcoming" },
          { label: "History", value: "history" },
          { label: "Needs attention", value: "attention", count: attention },
        ].map((tab) => ({
          label: tab.label,
          count: tab.count,
          href: href({ view: tab.value }),
          isActive: view === tab.value,
        }))}
      />

      {view === "summary" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Link
              href={href({ view: "upcoming" })}
              className="rounded-xl outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-brand-500"
              aria-label="Review scheduled renewals"
            >
              <Metric
                label="In the queue"
                value={queued}
                detail="Upcoming and pending renewals"
                tone="brand"
              />
            </Link>
            <Link
              href={href({ view: "upcoming", to: today })}
              className="rounded-xl outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-brand-500"
              aria-label="Review overdue renewals"
            >
              <Metric
                label="Overdue"
                value={data.overdue}
                detail="Due and still eligible to issue"
                tone={data.overdue ? "warning" : "neutral"}
              />
            </Link>
            <Link
              href={href({ view: "attention" })}
              className="rounded-xl outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-brand-500"
              aria-label="Review renewals needing attention"
            >
              <Metric
                label="Needs attention"
                value={attention}
                detail="Failed or expired activation offers"
                tone={attention ? "danger" : "neutral"}
              />
            </Link>
            <Link
              href={href({ view: "history", status: "AWAITING_ACTIVATION" })}
              className="rounded-xl outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-brand-500"
              aria-label="Review offers awaiting activation"
            >
              <Metric
                label="Awaiting activation"
                value={data.counts.AWAITING_ACTIVATION ?? 0}
                detail="Delivered; waiting for the holder"
                tone="neutral"
              />
            </Link>
          </div>
          <div className="grid items-start gap-6 lg:grid-cols-3">
            <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md lg:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
                <div className="flex items-center gap-2">
                  <CalendarClock
                    aria-hidden
                    className="size-5 text-brand-600"
                  />
                  <h2 className="text-section-title text-fg">
                    Renewal periods
                  </h2>
                </div>
                <Link
                  className={secondaryButton}
                  href={href({ view: "upcoming" })}
                >
                  View queue <ArrowRight aria-hidden className="size-4" />
                </Link>
              </div>
              {periods.size ? (
                <div className="divide-y divide-border">
                  {[...periods.values()].slice(0, 6).map((period) => (
                    <div
                      key={`${period.academicYear}:${period.dueAt.toISOString()}:${period.expiresAt.toISOString()}`}
                      className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                    >
                      <div>
                        <p className="font-medium text-fg">
                          Academic year {period.academicYear}
                        </p>
                        <p className="mt-1 text-sm text-fg-muted">
                          {formatRenewalDate(period.dueAt)} -{" "}
                          {formatRenewalDate(period.expiresAt, true)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-fg">
                          {period.count} renewals
                        </p>
                        <p className="mt-1 text-xs text-fg-subtle">
                          {period.suspended
                            ? `${period.suspended} suspended`
                            : period.dueAt <= data.asOf
                              ? "Due for processing"
                              : "Scheduled"}
                        </p>
                      </div>
                      <Link
                        className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
                        href={href({
                          view: "upcoming",
                          year: String(period.academicYear),
                        })}
                      >
                        Review <ArrowRight aria-hidden className="size-4" />
                      </Link>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-5 py-8 text-center">
                  <p className="font-medium text-fg">No renewals queued</p>
                  <p className="mt-2 text-sm text-fg-muted">
                    Enrol students in auto-renewal during individual or batch
                    issuance.
                  </p>
                </div>
              )}
              {periods.size > 6 && (
                <p className="border-t border-border px-5 py-3 text-xs text-fg-subtle">
                  Showing the next six periods. Open the queue for all scheduled
                  renewals.
                </p>
              )}
            </section>
            <section className="rounded-xl border border-border bg-surface p-5 shadow-md">
              <div className="flex items-center gap-2">
                <Clock3 aria-hidden className="size-5 text-brand-600" />
                <h2 className="text-section-title text-fg">Daily processing</h2>
              </div>
              <div className="mt-4">
                <StatusText
                  tone={
                    data.stale || data.runs[0]?.status === "PROCESSING"
                      ? "warning"
                      : tone(data.runs[0]?.status ?? "SUCCEEDED")
                  }
                >
                  {!data.lastCompleted
                    ? "Awaiting first run"
                    : data.stale
                      ? "Needs attention"
                      : data.runs[0]?.status === "FAILED"
                        ? "Last run failed"
                        : data.runs[0]?.status === "PARTIAL_FAILURE"
                          ? "Completed with errors"
                          : data.runs[0]?.status === "PROCESSING"
                            ? "Processing"
                            : "Running on schedule"}
                </StatusText>
              </div>
              <p className="mt-2 text-sm text-fg-muted">
                Once daily, around midnight South African time.
              </p>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-fg-subtle">Last completed</dt>
                  <dd className="mt-1 font-medium text-fg">
                    {data.lastCompleted?.completedAt
                      ? formatAcademicDateTime(
                          data.lastCompleted.completedAt.toISOString(),
                        )
                      : "No completed runs yet"}
                  </dd>
                </div>
                <div>
                  <dt className="text-fg-subtle">Last started</dt>
                  <dd className="mt-1 text-fg">
                    {data.runs[0]
                      ? formatAcademicDateTime(
                          data.runs[0].startedAt.toISOString(),
                        )
                      : "No runs yet"}
                  </dd>
                </div>
                {data.runs[0] && (
                  <div>
                    <dt className="text-fg-subtle">Latest run</dt>
                    <dd className="mt-1 text-fg">
                      {data.runs[0].processed} processed / {data.runs[0].failed}{" "}
                      failed
                    </dd>
                  </div>
                )}
              </dl>
              {data.runs[0]?.error && (
                <p
                  role="alert"
                  className="mt-4 rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-fg break-words"
                >
                  {data.runs[0].error}
                </p>
              )}
              {data.stale && data.lastCompleted && (
                <p
                  role="alert"
                  className="mt-4 rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-sm text-warning-fg"
                >
                  No completed run in 49 hours. Check the deployment&apos;s cron
                  activity.
                </p>
              )}
              {!!data.runs.length && (
                <details className="mt-4 border-t border-border pt-3 text-sm">
                  <summary className="cursor-pointer font-medium text-brand-700">
                    Recent runs
                  </summary>
                  <div className="mt-3 space-y-3">
                    {data.runs.map((run) => (
                      <div key={run.id}>
                        <p className="text-xs text-fg-subtle">
                          {formatAcademicDateTime(run.startedAt.toISOString())}
                        </p>
                        <p className="mt-1">
                          <StatusText tone={tone(run.status)}>
                            {label(run.status)}
                          </StatusText>
                        </p>
                        <p className="text-xs text-fg-muted">
                          {run.processed} processed / {run.failed} failed
                        </p>
                        {run.error && (
                          <p className="mt-1 break-words text-xs text-danger-fg">
                            {run.error}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </section>
          </div>
        </>
      ) : (
        <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
          <div className="border-b border-border px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-section-title text-fg">
                  {view === "history"
                    ? "Renewal history"
                    : view === "attention"
                      ? "Renewals needing attention"
                      : "Upcoming renewals"}
                </h2>
                <p className="mt-1 text-sm text-fg-muted">
                  {data.total} records
                  {params.year ? ` for academic year ${params.year}` : ""}
                </p>
              </div>
              <Link href={basePath} className={secondaryButton}>
                Back to operations
              </Link>
            </div>
            <form className="mt-4 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <input type="hidden" name="view" value={view} />
              {params.year && (
                <input type="hidden" name="year" value={params.year} />
              )}
              <label className="space-y-1.5 text-sm">
                <span className="font-medium text-fg">Student</span>
                <input
                  className={inputClass}
                  name="student"
                  defaultValue={params.student}
                  placeholder="Name or student number"
                />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium text-fg">Status</span>
                <select
                  className={inputClass}
                  name="status"
                  defaultValue={params.status ?? ""}
                >
                  <option value="">All statuses</option>
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {label(status)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium text-fg">From</span>
                <input
                  className={inputClass}
                  type="date"
                  name="from"
                  defaultValue={params.from}
                />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium text-fg">To</span>
                <input
                  className={inputClass}
                  type="date"
                  name="to"
                  defaultValue={params.to}
                />
              </label>
              <div className="flex gap-2">
                <button className="inline-flex h-10 items-center justify-center rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700">
                  Apply
                </button>
                <Link
                  className={`${secondaryButton} h-10`}
                  href={href({ view })}
                >
                  Clear
                </Link>
              </div>
            </form>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-body">
              <thead className="border-b border-border">
                <tr className="whitespace-nowrap text-caption uppercase tracking-wide text-fg-subtle">
                  {[
                    "Student",
                    "Academic year",
                    "Period",
                    "Status",
                    "Actions",
                  ].map((title) => (
                    <th className="px-5 py-3 font-medium" key={title}>
                      {title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.records.map((record) => (
                  <tr
                    key={record.id}
                    className="align-top transition hover:bg-surface-muted/60"
                  >
                    <td className="px-5 py-4">
                      <Link
                        className="font-medium text-brand-700 hover:underline"
                        href={`/students/${encodeURIComponent(record.student?.id ?? record.enrolment.studentId)}`}
                      >
                        {record.student
                          ? `${record.student.firstName} ${record.student.lastName}`
                          : record.enrolment.studentId}
                      </Link>
                      <p className="mt-1 text-xs text-fg-subtle">
                        {record.student?.studentNumber}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-fg">
                        {record.academicYear}
                      </p>
                      <p className="mt-1 text-xs text-fg-subtle">
                        {record.remainingYears} years remaining
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm text-fg-muted">
                      {formatRenewalDate(record.dueAt)}
                      <br />
                      to {formatRenewalDate(record.expiresAt, true)}
                    </td>
                    <td className="px-5 py-4">
                      <StatusText tone={tone(record.status)}>
                        {record.status === "DEFERRED" ||
                        (view === "upcoming" && record.suspended)
                          ? "Suspended"
                          : record.status === "SCHEDULED" &&
                              record.dueAt <= data.asOf
                            ? "Overdue"
                            : label(record.status)}
                      </StatusText>
                      {(record.lastError || record.attempts.length > 0) && (
                        <details className="mt-2 text-xs">
                          <summary className="cursor-pointer text-brand-700">
                            View details
                          </summary>
                          <div className="mt-2 max-w-xs space-y-2">
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
                            {record.activatedAt && (
                              <p>
                                Activated{" "}
                                {formatAcademicDateTime(
                                  record.activatedAt.toISOString(),
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
                                  {label(
                                    attempt.issuance?.deliveryStatus ??
                                      "PENDING",
                                  )}
                                </p>
                                <p>
                                  Activation:{" "}
                                  {attempt.issuance?.status === "ISSUED"
                                    ? "Activated"
                                    : attempt.issuance?.status === "REVOKED"
                                      ? "Revoked offer"
                                      : attempt.issuance?.status === "FAILED"
                                        ? "Needs attention"
                                        : "Awaiting activation"}
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
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-2">
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
                            label="Cancel auto-renewal"
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
      )}
    </div>
  );
}
