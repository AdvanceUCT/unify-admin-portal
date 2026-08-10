/**
 * @fileoverview Shows per-student progress and failures for one batch issuance run.
 * @module features/credentials/BatchRunDetailView
 */

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
      <section className="rounded-xl border border-border bg-surface p-5 shadow-md">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-section-title text-fg">{run.batchId}</h2>
              <Badge tone={runTone(run.status)}>{run.status}</Badge>
            </div>
            <p className="mt-1 text-sm text-fg-muted">
              Created {formatDateTime(run.createdAt)} · {run.issuedCount} issued · {run.failedCount} failed ·{" "}
              {run.skippedCount} skipped
            </p>
          </div>
          <button
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!hasFailedItems || isRetrying}
            onClick={handleRetry}
            type="button"
          >
            {isRetrying ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <RotateCcw aria-hidden className="size-4" />}
            Retry failed
          </button>
        </div>
        {error ? (
          <p className="mt-4 rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-fg">
            {error}
          </p>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <div className="overflow-x-auto">
          <table className="w-full text-center text-body">
            <thead className="border-b border-border">
              <tr className="whitespace-nowrap text-caption uppercase tracking-wide text-fg-subtle">
                <th className="px-5 py-3 font-medium">Student</th>
                <th className="px-5 py-3 font-medium">Credential</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {run.items.map((item) => (
                <tr className="transition hover:bg-surface-muted/60" key={`${run.batchId}-${item.studentId}`}>
                  <td className="whitespace-nowrap px-5 py-4">
                    <p className="font-medium text-fg">{item.holderName}</p>
                    <p className="text-xs tabular-nums text-fg-subtle">{item.studentId}</p>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 tabular-nums text-fg-muted">{item.credentialId}</td>
                  <td className="px-5 py-4">
                    <Badge tone={itemTone(item.status)}>{item.status}</Badge>
                  </td>
                  <td className="px-5 py-4 text-fg-muted">
                    {item.failureReason ?? item.skipReason ?? (item.deliveredAt ? `Delivered ${formatDateTime(item.deliveredAt)}` : "Pending")}
                    {item.activationUrl ? (
                      <a
                        className="mt-1 block max-w-xs truncate text-xs font-medium text-info-fg hover:underline"
                        href={item.activationUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Open activation link
                      </a>
                    ) : null}
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
