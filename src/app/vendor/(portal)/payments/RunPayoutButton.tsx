/**
 * @fileoverview Demo interaction for running the signed-in vendor's eligible payout immediately.
 * @module app/vendor/(portal)/payments/RunPayoutButton
 */

"use client";

import { AlertTriangle, CheckCircle2, Loader2, WalletCards } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { runOwnPayoutAction, type RunOwnPayoutResult } from "./actions";

function formatMoney(amountMinor: number, currency = "ZAR") {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency,
  }).format(amountMinor / 100);
}

function resultTone(result: RunOwnPayoutResult) {
  if (result.status === "completed") return "border-success-border bg-success-bg text-success-fg";
  if (result.status === "processing" || result.status === "requires_reconciliation") {
    return "border-warning-border bg-warning-bg text-warning-fg";
  }
  return "border-danger-border bg-danger-bg text-danger-fg";
}

export function RunPayoutButton({
  availableMinor,
  compact = false,
  embedded = false,
  hasDestination,
}: {
  availableMinor: number;
  compact?: boolean;
  embedded?: boolean;
  hasDestination: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<RunOwnPayoutResult | null>(null);
  const canRun = hasDestination && availableMinor > 0 && !isPending;

  function handleRunPayout() {
    setResult(null);
    startTransition(async () => {
      const nextResult = await runOwnPayoutAction();
      setResult(nextResult);
      router.refresh();
    });
  }

  return (
    <div className={embedded ? "space-y-3" : "space-y-3 rounded-lg border border-border bg-surface p-4"}>
      <div className={compact ? "space-y-3" : "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"}>
        {compact ? null : (
          <div>
            <p className="text-sm font-semibold text-fg">Demo payout run</p>
            <p className="mt-1 text-xs text-fg-subtle">
              Runs this vendor&apos;s eligible payout now without waiting for the scheduled cron job.
            </p>
          </div>
        )}
        <button
          className={`inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-fg-subtle ${compact ? "w-full" : ""}`}
          disabled={!canRun}
          onClick={handleRunPayout}
          type="button"
        >
          {isPending ? (
            <>
              <Loader2 aria-hidden="true" className="animate-spin" size={16} />
              Running payout...
            </>
          ) : result?.status === "completed" ? (
            <>
              <CheckCircle2 aria-hidden="true" className="animate-bounce" size={16} />
              Paid out
            </>
          ) : (
            <>
              <WalletCards aria-hidden="true" className={canRun ? "animate-pulse" : ""} size={16} />
              {compact ? "Run demo payout" : "Run payout now"}
            </>
          )}
        </button>
      </div>

      {!hasDestination ? (
        <p className="text-xs text-fg-subtle">Save a payout destination before running a payout.</p>
      ) : availableMinor <= 0 ? (
        <p className="text-xs text-fg-subtle">There is no eligible payout balance right now.</p>
      ) : (
        <p className="text-xs text-fg-subtle">
          Ready to pay out {formatMoney(availableMinor)} from this vendor&apos;s eligible settled wallet takings.
        </p>
      )}

      {isPending ? (
        <div className="overflow-hidden rounded-full bg-surface-muted">
          <div className="h-1 w-1/2 animate-pulse rounded-full bg-brand-600" />
        </div>
      ) : null}

      {result ? (
        <div className={`rounded-lg border px-3 py-2 text-sm ${resultTone(result)}`}>
          <div className="flex items-start gap-2">
            {result.status === "completed" ? (
              <CheckCircle2 aria-hidden="true" className="mt-0.5 shrink-0" size={16} />
            ) : (
              <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0" size={16} />
            )}
            <div>
              <p className="font-medium">
                {result.status === "completed"
                  ? `Paid out ${formatMoney(result.amountMinor, result.currency)}.`
                  : result.message}
              </p>
              {result.status === "completed" ? <p className="mt-0.5 text-xs">{result.message}</p> : null}
              {result.reference ? <p className="mt-0.5 text-xs">Reference {result.reference}</p> : null}
              {result.failureCode ? <p className="mt-0.5 text-xs">Code {result.failureCode}</p> : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
