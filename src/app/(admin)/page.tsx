import { SectionHeader } from "@/components/layout/SectionHeader";
import { Badge } from "@/components/ui/Badge";
import { Metric } from "@/components/ui/Metric";
import { getDashboardSummary, getRecentAuditEvents } from "@/lib/api/client";
import { formatDateTime, formatEventType } from "@/lib/formatters";

export default async function AdminOverviewPage() {
  const [summary, auditEvents] = await Promise.all([getDashboardSummary(), getRecentAuditEvents()]);

  return (
    <div className="space-y-8">
      <SectionHeader
        title="Operational overview"
        description="Simulated credential lifecycle, vendor onboarding, and audit activity."
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Active credentials" value={summary.activeCredentials} detail="usable student VCs" />
        <Metric label="Pending issuance" value={summary.pendingIssuance} detail="queued or offered" />
        <Metric label="Vendors pending" value={summary.vendorsPendingApproval} detail="awaiting approval" />
        <Metric label="Audit events" value={summary.auditEventsToday} detail="today" />
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-950">Recent audit events</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-5 py-3 font-medium">Event</th>
                <th className="px-5 py-3 font-medium">Target</th>
                <th className="px-5 py-3 font-medium">Result</th>
                <th className="px-5 py-3 font-medium">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {auditEvents.map((event) => (
                <tr key={event.id}>
                  <td className="px-5 py-4 font-medium text-zinc-900">{formatEventType(event.eventType)}</td>
                  <td className="px-5 py-4 text-zinc-600">{event.targetId}</td>
                  <td className="px-5 py-4">
                    <Badge tone={event.result === "Success" ? "success" : "warning"}>{event.result}</Badge>
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
