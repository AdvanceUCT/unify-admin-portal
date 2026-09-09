/**
 * @fileoverview Renders the Billing Operations Card used by `/settings/BillingOperationsCard.tsx`.
 * @module app/(admin)/settings/BillingOperationsCard
 */

"use client";

import { useState, useTransition } from "react";

import type { BillingOperationsSummary } from "@/lib/billing/operationsSummary";
import { SettingsField } from "./SettingsCard";
import { getBillingOperationsSummaryAction, runBillingReconciliationNowAction } from "./actions";

const JOB_LABELS: Record<string, string> = {
  VENDOR_BILLING_DAILY: "Daily billing job",
  VENDOR_BILLING_RECONCILE: "Reconciliation",
  VERIFICATION_CHARGE_BACKFILL: "Historical backfill",
};

function formatAge(seconds: number) {
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}

export function BillingOperationsCard({ initialSummary }: { initialSummary: BillingOperationsSummary }) {
  const [summary, setSummary] = useState(initialSummary);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleRefresh() {
    setError(null);
    startTransition(async () => {
      try {
        setSummary(await getBillingOperationsSummaryAction());
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to refresh.");
      }
    });
  }

  function handleRunReconciliationNow() {
    setError(null);
    startTransition(async () => {
      try {
        setSummary(await runBillingReconciliationNowAction());
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to run reconciliation.");
      }
    });
  }

  return (
    <div>
      <div className="divide-y divide-border">
        {summary.jobRuns.map((run) => (
          <SettingsField
            key={run.jobType}
            label={JOB_LABELS[run.jobType] ?? run.jobType}
            value={run.lastRunAtIso ? `${run.lastRunStatus} · ${run.lastRunAtIso.slice(0, 19).replace("T", " ")}` : "Never run"}
          />
        ))}
        <SettingsField label="Unclaimed historical usage" value={`${summary.unclaimedChargeCount} charge(s) not yet invoiced`} />
        <SettingsField
          label="Pending payment attempts"
          value={
            summary.pendingAttemptCount === 0
              ? "None"
              : `${summary.pendingAttemptCount} (oldest ${summary.oldestPendingAttemptAgeSeconds !== null ? formatAge(summary.oldestPendingAttemptAgeSeconds) : "—"})`
          }
        />
        <SettingsField label="Webhook processing failures" value={summary.webhookFailureCount} />
        <SettingsField label="Duplicate/excess payment exceptions" value={summary.duplicatePaymentExceptionCount} />
        <SettingsField label="Split-routing exceptions" value={summary.splitExceptionCount} />
        <SettingsField label="Collected (ZAR)" value={summary.collectedTotalDisplay} />
        <SettingsField label="Settlement" value={summary.settlementNote} />
      </div>

      {error && <p className="mt-3 text-sm text-danger-fg">{error}</p>}

      <div className="mt-4 flex items-center gap-3 border-t border-border pt-4">
        <button
          className="h-9 rounded-md border border-border bg-surface px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isPending}
          onClick={handleRefresh}
          type="button"
        >
          {isPending ? "Refreshing…" : "Refresh"}
        </button>
        <button
          className="h-9 rounded-md border border-border bg-surface px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isPending}
          onClick={handleRunReconciliationNow}
          type="button"
        >
          {isPending ? "Running…" : "Run reconciliation now"}
        </button>
      </div>
    </div>
  );
}
