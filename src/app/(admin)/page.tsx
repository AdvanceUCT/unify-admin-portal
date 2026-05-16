import { SectionHeader } from "@/components/layout/SectionHeader";
import { Badge } from "@/components/ui/Badge";
import { Metric } from "@/components/ui/Metric";
import { getDashboardSummary, getRecentCredentialEvents } from "@/lib/api/server";
import { ADMIN_ROLES } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { formatCredentialStatus, formatDateTime } from "@/lib/formatters";

export default async function AdminOverviewPage() {
  await requireRole(ADMIN_ROLES);

  const [summary, credentialEvents] = await Promise.all([getDashboardSummary(), getRecentCredentialEvents()]);

  return (
    <div className="space-y-8">
      <SectionHeader
        title="Operational overview"
        description="Simulated credential lifecycle, vendor onboarding, and audit activity."
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Issued credentials" value={summary.issuedCredentials} detail="stored by students" />
        <Metric label="Pending issuance" value={summary.pendingIssuance} detail="sent, received, or accepted" />
        <Metric label="Failed credentials" value={summary.failedCredentials} detail="ready to retry" />
        <Metric label="Active batches" value={summary.activeBatchJobs} detail="queued or processing" />
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-950">Recent credential events</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-5 py-3 font-medium">Exchange</th>
                <th className="px-5 py-3 font-medium">State</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {credentialEvents.map((event) => (
                <tr key={event.id}>
                  <td className="px-5 py-4 font-medium text-zinc-900">
                    {event.credentialExchangeId ?? event.outOfBandId ?? event.connectionId ?? "Unknown"}
                  </td>
                  <td className="px-5 py-4 text-zinc-600">{event.previousState ? `${event.previousState} -> ${event.state}` : event.state}</td>
                  <td className="px-5 py-4">
                    {event.status ? <Badge tone={event.status === "ISSUED" ? "success" : "warning"}>{formatCredentialStatus(event.status)}</Badge> : null}
                  </td>
                  <td className="px-5 py-4 text-zinc-600">{formatDateTime(event.occurredAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
