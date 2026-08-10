/**
 * @fileoverview Lists recent batch issuance runs and their completion totals.
 * @module features/credentials/BatchRunsTable
 */

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
    <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
      <div className="overflow-x-auto">
        <table className="w-full text-center text-body">
          <thead className="border-b border-border">
            <tr className="whitespace-nowrap text-caption uppercase tracking-wide text-fg-subtle">
              <th className="px-5 py-3 font-medium">Batch</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Counts</th>
              <th className="px-5 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {runs.length === 0 ? (
              <tr>
                <td className="px-5 py-10 text-fg-subtle" colSpan={4}>
                  No batch runs have been created yet.
                </td>
              </tr>
            ) : (
              runs.map((run) => (
                <tr className="transition hover:bg-surface-muted/60" key={run.batchId}>
                  <td className="whitespace-nowrap px-5 py-4">
                    <Link
                      className="font-medium tabular-nums text-fg hover:underline"
                      href={`/credentials/issuance/batch/runs/${run.batchId}`}
                    >
                      {run.batchId}
                    </Link>
                    <p className="text-xs text-fg-subtle">{run.cohortId}</p>
                  </td>
                  <td className="px-5 py-4">
                    <Badge tone={runTone(run.status)}>{run.status}</Badge>
                  </td>
                  <td className="px-5 py-4 text-fg-muted">
                    {run.issuedCount} issued · {run.failedCount} failed · {run.skippedCount} skipped
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 tabular-nums text-fg-muted">
                    {formatDateTime(run.createdAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
