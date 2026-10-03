import { StatusText } from "@/components/ui/StatusText";
import { renewalOverview } from "@/lib/credentials/renewalOverview";
import { formatAcademicDateTime } from "@/lib/formatters";
import { renewalStatusLabel as label } from "@/lib/credentials/renewalPresentation";
function tone(status: string) {
  return status === "FAILED" ? "danger" as const : status === "PARTIAL_FAILURE" || status === "PROCESSING" ? "warning" as const : "neutral" as const;
}
export async function RenewalSchedulerDetails() {
  const data = await renewalOverview({ view: "summary" });
  return (            <details className="mt-5 border-t border-border pt-4">
              <summary className="cursor-pointer text-sm font-medium text-fg-muted">Daily processing diagnostics</summary>
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
            </details>);
}
