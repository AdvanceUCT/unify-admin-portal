/**
 * @fileoverview Shows per-student progress and failures for one batch issuance run.
 * @module features/credentials/BatchRunDetailView
 */

"use client";

import { useState } from "react";
import { LoaderCircle, RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { getBatchRun, retryFailedBatchRun } from "@/lib/api/client";
import type { BatchIssuanceItemStatus, BatchIssuanceRunDetail, BatchIssuanceRunStatus } from "@/lib/api/types";
import { useBatchPolling } from "./useBatchPolling";
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
  const { value: run, setValue: setRun, pollError } = useBatchPolling(initialRun,
    value => value.status === "Queued" || value.status === "Processing",
    signal => getBatchRun(initialRun.batchId, signal), 3000);
  const active = run.status === "Queued" || run.status === "Processing";
  const counts = { pending: 0, offers: 0, delivered: 0, failed: 0, skipped: 0 };
  for (const item of run.items) {
    if (item.status === "Pending") counts.pending++;
    else if (item.status === "OfferCreated") counts.offers++;
    else if (item.status === "Delivered" || item.status === "Activated") counts.delivered++;
    else if (item.status === "Skipped") counts.skipped++;
    else if (item.status === "Failed" || item.status === "DeliveryFailed") counts.failed++;
  }
  const processed = counts.delivered + counts.failed + counts.skipped;
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
              <Badge tone={runTone(run.status)}>
                {active ? <LoaderCircle aria-hidden className="mr-1.5 size-3.5 animate-spin motion-reduce:animate-none" /> : null}
                {run.status}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-fg-muted">
              Created {formatDateTime(run.createdAt)} · {run.issuedCount} issued · {run.failedCount} failed ·{" "}
              {run.skippedCount} skipped
            </p>
          </div>
          <button
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!hasFailedItems || isRetrying || active}
            onClick={handleRetry}
            type="button"
          >
            {isRetrying ? <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" /> : <RotateCcw aria-hidden className="size-4" />}
            {isRetrying ? "Starting retry..." : "Retry failed"}
          </button>
        </div>
        <div className="mt-4 space-y-2 text-sm text-fg-muted" aria-live="polite">
          <p>{processed} / {run.requestedCount} processed; {counts.pending} pending; {counts.offers} offers created; {counts.delivered} delivered; {counts.failed} failed; {counts.skipped} skipped</p>
          <progress aria-label="Batch progress" className="h-2 w-full" max={Math.max(1, run.requestedCount)} value={processed} />
          <p className="flex items-start gap-2">
            {active ? <LoaderCircle aria-hidden className="mt-0.5 size-4 shrink-0 animate-spin text-brand-600 motion-reduce:animate-none" /> : null}
            <span>
              {active ? `${run.status === "Queued" ? "Starting batch." : "Processing batch."} You can leave this page; processing continues in the background.` : "Batch processing finished."} Email delivery is separate from wallet acceptance.
            </span>
          </p>
          {pollError ? <p role="status">{pollError}</p> : null}
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
