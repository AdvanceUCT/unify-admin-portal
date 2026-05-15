import Link from "next/link";

import { Badge } from "@/components/ui/Badge";
import type { BatchIssuanceRunStatus, BatchIssuanceRunSummary } from "@/lib/api/types";
import { formatDateTime } from "@/lib/formatters";

function runTone(status: BatchIssuanceRunStatus) {
  if (status === "Completed") return "success";
  if (status === "PartiallyFailed" || status === "Failed") return "danger";
  if (status === "Processing" || status === "Queued") return "warning";
  return "neutral";
}

export function BatchRunsTable({ runs }: { runs: BatchIssuanceRunSummary[] }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-5 py-3 font-medium">Batch</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Counts</th>
              <th className="px-5 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {runs.length === 0 ? (
              <tr>
                <td className="px-5 py-10 text-center text-sm text-zinc-500" colSpan={4}>
                  No batch runs have been created yet.
                </td>
              </tr>
            ) : (
              runs.map((run) => (
                <tr key={run.batchId}>
                  <td className="px-5 py-4">
                    <Link
                      className="font-medium text-zinc-950 hover:underline"
                      href={`/credentials/issuance/batch/runs/${run.batchId}`}
                    >
                      {run.batchId}
                    </Link>
                    <p className="text-xs text-zinc-500">{run.cohortId}</p>
                  </td>
                  <td className="px-5 py-4">
                    <Badge tone={runTone(run.status)}>{run.status}</Badge>
                  </td>
                  <td className="px-5 py-4 text-zinc-600">
                    {run.issuedCount} issued · {run.failedCount} failed · {run.skippedCount} skipped
                  </td>
                  <td className="px-5 py-4 text-zinc-600">{formatDateTime(run.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
