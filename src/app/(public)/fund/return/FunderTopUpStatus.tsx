/**
 * @fileoverview Auto-reconciles and polls a funder top-up on return from Paystack hosted checkout.
 * @module app/(public)/fund/return/FunderTopUpStatus
 */

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { POLL_DELAYS_MS } from "@/app/vendor/(portal)/invoices/paymentPolling";
import { formatMoneyMinor } from "@/lib/formatters";
import type { FunderTopupResult } from "@/lib/payments/topups";

type Phase = "confirming" | "unresolved";

const PRIMARY_BUTTON_CLASS =
  "mt-3 inline-flex h-9 items-center rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700";

function isFinal(status: FunderTopupResult["status"]) {
  return status === "SUCCEEDED" || status === "FAILED";
}

async function postFunderTopup(path: "reconcile" | "status", topUp: Pick<FunderTopupResult, "topUpId" | "reference">) {
  const response = await fetch(`/api/fund/topups/${path}`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topUpId: topUp.topUpId, reference: topUp.reference }),
  });
  if (!response.ok) throw new Error("Unable to check payment status.");
  return (await response.json()) as FunderTopupResult;
}

function sleep(delayMs: number) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

/**
 * The browser return is only ever a hint, never proof: reconcile verifies the
 * stored attempt with Paystack, and the webhook and cron credit the wallet even
 * if this tab is closed. Nothing about the student is ever shown here.
 */
export function FunderTopUpStatus({ initial }: { initial: FunderTopupResult }) {
  const [topUp, setTopUp] = useState(initial);
  const [phase, setPhase] = useState<Phase>("confirming");
  // Bumped by "Check again" to re-run the reconcile-then-poll sequence.
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (isFinal(initial.status)) return;
    let cancelled = false;

    async function run() {
      try {
        const reconciled = await postFunderTopup("reconcile", initial);
        if (cancelled) return;
        setTopUp(reconciled);
        if (isFinal(reconciled.status)) return;
      } catch {
        // Ignore — the webhook may confirm this independently of this call.
      }

      try {
        for (const delayMs of POLL_DELAYS_MS) {
          await sleep(delayMs);
          if (cancelled) return;
          const snapshot = await postFunderTopup("status", initial);
          if (cancelled) return;
          setTopUp(snapshot);
          if (isFinal(snapshot.status)) return;
        }
      } catch {
        // Fall through to the unresolved message; it never blames the funder.
      }
      if (!cancelled) setPhase("unresolved");
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [initial, round]);

  const amount = formatMoneyMinor(topUp.amountMinor, topUp.currency);

  return (
    <section className="rounded-xl border border-border bg-surface p-6 text-center shadow-md" aria-live="polite">
      {topUp.status === "SUCCEEDED" ? (
        <div className="space-y-2">
          <p className="font-medium text-success-fg">Payment successful</p>
          <p className="text-sm text-fg-muted">You sent {amount} to the student&apos;s wallet. Thank you.</p>
          <p className="text-xs text-fg-subtle">
            Reference: <span className="font-mono">{topUp.reference}</span>
          </p>
          <Link className={PRIMARY_BUTTON_CLASS} href="/fund">
            Fund another student
          </Link>
        </div>
      ) : topUp.status === "FAILED" ? (
        <div className="space-y-2">
          <p className="text-danger-fg">The payment was not completed. You have not been charged.</p>
          <Link className={PRIMARY_BUTTON_CLASS} href="/fund">
            Try again
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-fg-muted">
            {phase === "confirming"
              ? "Confirming your payment…"
              : "We're still confirming this payment. You'll receive a Paystack receipt if it succeeded; the student's wallet will be credited automatically."}
          </p>
          <button
            className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-60"
            disabled={phase === "confirming"}
            onClick={() => {
              setPhase("confirming");
              setRound((value) => value + 1);
            }}
            type="button"
          >
            Check again
          </button>
        </div>
      )}
    </section>
  );
}
