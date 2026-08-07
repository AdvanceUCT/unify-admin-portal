import { AlertTriangle } from "lucide-react";

import { SectionHeader } from "@/components/layout/SectionHeader";
import { Badge } from "@/components/ui/Badge";
import { Metric } from "@/components/ui/Metric";
import { checkAgentHealth } from "@/lib/agentClient";
import { getDashboardSummary, getRecentCredentialEvents } from "@/lib/api/server";
import { ADMIN_ROLES } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { credentialStatusTone, formatCredentialStatus, formatDateTime } from "@/lib/formatters";
import { AgentConnectionWidget } from "./AgentConnectionWidget";

export default async function AdminOverviewPage() {
  await requireRole(ADMIN_ROLES);

  const [summary, credentialEvents, agentHealth] = await Promise.all([
    getDashboardSummary(),
    getRecentCredentialEvents(),
    checkAgentHealth(),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionHeader
          title="Operational overview"
          description="Simulated credential lifecycle, vendor onboarding, and audit activity."
        />
        <AgentConnectionWidget initialHealth={agentHealth} />
      </div>

      {!agentHealth.ok ? (
        <div className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">Identity Agent Service is unreachable</p>
            <p className="mt-0.5 text-rose-700">
              {agentHealth.error} Credential issuance and verification may be affected. See{" "}
              <a className="underline underline-offset-2" href="/settings">
                Settings → Agent service health
              </a>{" "}
              for details.
            </p>
          </div>
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Issued credentials" value={summary.issuedCredentials} detail="stored by students" />
        <Metric label="Pending issuance" value={summary.pendingIssuance} detail="sent or accepted" />
        <Metric label="Failed credentials" value={summary.failedCredentials} detail="ready to retry" />
        <Metric label="Active batches" value={summary.activeBatchJobs} detail="queued or processing" />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Vendor applications" value={summary.vendorsPendingApproval} detail="awaiting review" />
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-950">Recent credential events</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-5 py-3 font-medium">Student ID</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Schema version</th>
                <th className="px-5 py-3 font-medium">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {credentialEvents.map((event) => (
                <tr key={event.id}>
                  <td className="px-5 py-4 font-medium text-zinc-900">{event.studentId ?? "Unknown"}</td>
                  <td className="px-5 py-4">
                    {event.status ? (
                      <Badge tone={credentialStatusTone(event.status)}>{formatCredentialStatus(event.status)}</Badge>
                    ) : null}
                  </td>
                  <td className="px-5 py-4 text-zinc-600">{event.schemaVersion ?? "—"}</td>
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
