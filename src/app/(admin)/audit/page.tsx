import { SectionHeader } from "@/components/layout/SectionHeader";
import { Badge } from "@/components/ui/Badge";
import { getAuditEvents } from "@/lib/api/client";
import { formatDateTime, formatEventType } from "@/lib/formatters";

export default async function AuditPage() {
  const events = await getAuditEvents();

  return (
    <div className="space-y-6">
      <SectionHeader title="Audit log" description="Credential, vendor, verification, and simulated payment events." />
      <section className="rounded-lg border border-zinc-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-5 py-3 font-medium">Event</th>
                <th className="px-5 py-3 font-medium">Actor</th>
                <th className="px-5 py-3 font-medium">Target</th>
                <th className="px-5 py-3 font-medium">Result</th>
                <th className="px-5 py-3 font-medium">Occurred</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {events.map((event) => (
                <tr key={event.id}>
                  <td className="px-5 py-4 font-medium text-zinc-950">{formatEventType(event.eventType)}</td>
                  <td className="px-5 py-4 text-zinc-600">{event.actorId}</td>
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
