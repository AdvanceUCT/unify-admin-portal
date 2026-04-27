"use client";

import { Badge } from "@/components/ui/Badge";
import { useAdminState } from "@/lib/api/useAdminState";
import type { AdminState } from "@/lib/api/types";
import { formatDateTime, formatEventType } from "@/lib/formatters";

export function AuditTable({ initialState }: { initialState: AdminState }) {
  const { error, state } = useAdminState({ initialState });
  const events = state?.auditEvents ?? initialState.auditEvents;

  return (
    <section className="rounded-lg border border-zinc-200 bg-white">
      {error ? <p className="border-b border-zinc-200 px-5 py-3 text-sm text-amber-700">{error}</p> : null}
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
  );
}
