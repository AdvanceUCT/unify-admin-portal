import { Metric } from "@/components/ui/Metric";
import { StatusText } from "@/components/ui/StatusText";
import { getDashboardSummary, getRecentCredentialEvents } from "@/lib/api/server";
import { ADMIN_ROLES } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import {
  credentialStatusTone,
  formatCredentialActivityEventStatus,
  formatDateTime,
} from "@/lib/formatters";

export default async function AdminOverviewPage() {
  await requireRole(ADMIN_ROLES);

  const [summary, credentialEvents] = await Promise.all([
    getDashboardSummary(),
    getRecentCredentialEvents(),
  ]);

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          detail="Stored by students"
          label="Issued credentials"
          tone="success"
          value={summary.issuedCredentials}
        />
        <Metric
          detail="Sent or accepted"
          label="Pending issuance"
          tone="warning"
          value={summary.pendingIssuance}
        />
        <Metric
          detail="Ready to retry"
          label="Failed credentials"
          tone="danger"
          value={summary.failedCredentials}
        />
        <Metric
          detail="Awaiting review"
          label="Vendor applications"
          tone="brand"
          value={summary.vendorsPendingApproval}
        />
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-section-title text-fg">Recent credential events</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-center text-body">
            <thead className="border-b border-border">
              <tr className="whitespace-nowrap text-caption uppercase tracking-wide text-fg-subtle">
                <th className="px-5 py-3 font-medium">Student ID</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Schema version</th>
                <th className="px-5 py-3 font-medium">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {credentialEvents.length === 0 ? (
                <tr>
                  <td className="px-5 py-10 text-fg-subtle" colSpan={4}>
                    No credential events recorded yet.
                  </td>
                </tr>
              ) : (
                credentialEvents.map((event) => (
                  <tr className="transition hover:bg-surface-muted/60" key={event.id}>
                    <td className="px-5 py-4 font-medium tabular-nums text-fg">
                      {event.studentId ?? "Unknown"}
                    </td>
                    <td className="px-5 py-4">
                      {event.status ? (
                        <StatusText tone={credentialStatusTone(event.status)}>
                          {formatCredentialActivityEventStatus(event)}
                        </StatusText>
                      ) : (
                        <span className="text-fg-subtle">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4 tabular-nums">
                      {event.schemaVersion ? (
                        <span className="font-semibold text-info-fg">v{event.schemaVersion}</span>
                      ) : (
                        <span className="text-fg-subtle">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-fg-muted">{formatDateTime(event.occurredAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
