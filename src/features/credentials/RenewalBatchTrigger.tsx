"use client";

import { LoaderCircle, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { RenewAllDueCredentialsSummary } from "@/lib/credentials/renewal";

type RenewalBatchTriggerProps = {
  flaggedCount: number;
  totalDue: number;
  willRenewCount: number;
};

async function readErrorMessage(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? fallback;
}

export function RenewalBatchTrigger({ flaggedCount, totalDue, willRenewCount }: RenewalBatchTriggerProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [summary, setSummary] = useState<RenewAllDueCredentialsSummary | null>(null);

  async function runBatch() {
    const confirmationMessage =
      flaggedCount > 0
        ? `This will attempt to renew all ${totalDue} due credentials now — ${willRenewCount} are expected to succeed, but ${flaggedCount} are flagged and will likely fail (see below). Continue anyway?`
        : `This will immediately renew all ${totalDue} due credentials. Continue?`;

    if (!window.confirm(confirmationMessage)) return;

    setError(null);
    setSummary(null);
    setIsRunning(true);

    try {
      const response = await fetch("/api/admin/credential-renewals/run", { cache: "no-store", method: "POST" });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "The renewal batch failed to run."));
      }

      setSummary((await response.json()) as RenewAllDueCredentialsSummary);
      router.refresh();
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "The renewal batch failed to run.");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-zinc-950 bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500"
        disabled={isRunning || totalDue === 0}
        onClick={runBatch}
        type="button"
      >
        {isRunning ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <RefreshCw aria-hidden className="size-4" />}
        {isRunning ? "Renewing..." : `Renew ${totalDue} now`}
      </button>

      {error ? <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      {summary ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Ran just now: {summary.renewed} renewed, {summary.failed.length} failed out of {summary.attempted} attempted. The list
          below has been refreshed.
        </p>
      ) : null}
    </div>
  );
}
