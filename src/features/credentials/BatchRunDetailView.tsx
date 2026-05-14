"use client";

import { useState } from "react";
import { LoaderCircle, RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { retryFailedBatchRun } from "@/lib/api/client";
import type { BatchIssuanceItemStatus, BatchIssuanceRunDetail, BatchIssuanceRunStatus } from "@/lib/api/types";
import { formatDateTime } from "@/lib/formatters";

function runTone(status: BatchIssuanceRunStatus) {
  if (status === "Completed") return "success";
  if (status === "PartiallyFailed" || status === "Failed") return "danger";
  if (status === "Processing" || status === "Queued") return "warning";
  return "neutral";
}

function itemTone(status: BatchIssuanceItemStatus) {
  if (status === "Delivered" || status === "Activated") return "success";
  if (status === "Failed" || status === "DeliveryFailed") return "danger";
  if (status === "Skipped") return "neutral";
  return "warning";
}

export function BatchRunDetailView({ initialRun }: { initialRun: BatchIssuanceRunDetail }) {
  const [run, setRun] = useState(initialRun);
  const [error, setError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const hasFailedItems = run.items.some((item) => item.status === "Failed" || item.status === "DeliveryFailed");

  async function handleRetry() {
    setError(null);
    setIsRetrying(true);
    try {
      setRun(await retryFailedBatchRun(run.batchId));
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "Retry failed.");
    } finally {
      setIsRetrying(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-base font-semibold text-zinc-950">{run.batchId}</h2>
              <Badge tone={runTone(run.status)}>{run.status}</Badge>
            </div>
            <p className="mt-1 text-sm text-zinc-500">
              Created {formatDateTime(run.createdAt)} · {run.issuedCount} issued · {run.failedCount} failed ·{" "}
              {run.skippedCount} skipped
            </p>
          </div>
          <button
            className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!hasFailedItems || isRetrying}
            onClick={handleRetry}
            type="button"
          >
            {isRetrying ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <RotateCcw aria-hidden className="size-4" />}
            Retry failed
          </button>
        </div>
        {error ? <p className="mt-3 text-sm text-amber-700">{error}</p> : null}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-5 py-3 font-medium">Student</th>
                <th className="px-5 py-3 font-medium">Credential</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {run.items.map((item) => (
                <tr key={`${run.batchId}-${item.studentId}`}>
                  <td className="px-5 py-4">
                    <p className="font-medium text-zinc-950">{item.holderName}</p>
                    <p className="text-xs text-zinc-500">{item.studentId}</p>
                  </td>
                  <td className="px-5 py-4 text-zinc-600">{item.credentialId}</td>
                  <td className="px-5 py-4">
                    <Badge tone={itemTone(item.status)}>{item.status}</Badge>
                  </td>
                  <td className="px-5 py-4 text-zinc-600">
                    {item.failureReason ?? item.skipReason ?? (item.deliveredAt ? `Delivered ${formatDateTime(item.deliveredAt)}` : "Pending")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
