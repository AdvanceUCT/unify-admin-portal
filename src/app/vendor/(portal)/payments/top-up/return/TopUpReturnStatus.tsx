/**
 * @fileoverview Auto-reconciles and polls a vendor wallet top-up on return from Paystack hosted checkout.
 * @module app/vendor/(portal)/payments/top-up/return/TopUpReturnStatus
 */

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { POLL_DELAYS_MS } from "@/app/vendor/(portal)/invoices/paymentPolling";
import { formatMoneyMinor } from "@/lib/formatters";
import type { VendorWalletTopupResult } from "@/lib/vendors/walletTopups";

type Phase = "confirming" | "pending" | "error";

function isFinal(status: VendorWalletTopupResult["status"]) {
  return status === "SUCCEEDED" || status === "FAILED";
}

async function fetchTopUpStatus(topUpId: string) {
  const response = await fetch(`/api/vendor/wallet/topups/${encodeURIComponent(topUpId)}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(response.status === 401 ? "Your session has expired. Sign in again to see the latest status." : "Unable to check top-up status.");
  }
  return (await response.json()) as VendorWalletTopupResult;
}

function sleep(delayMs: number) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

/**
 * The browser return is only ever a hint, never proof — the owner-scoped
 * reconcile route verifies the stored attempt with Paystack, and the webhook
 * and cron would credit the wallet even if this tab were closed.
 */
export function TopUpReturnStatus({
  paymentsRestored,
  topUp,
}: {
  paymentsRestored: boolean;
  topUp: VendorWalletTopupResult;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("confirming");
  const [message, setMessage] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const final = isFinal(topUp.status);

  useEffect(() => {
    if (final) return;
    cancelledRef.current = false;

    async function run() {
      try {
        await fetch(`/api/vendor/wallet/topups/${encodeURIComponent(topUp.topUpId)}/reconcile`, { method: "POST" });
      } catch {
        // Ignore — the webhook may confirm this independently of this call.
      }

      try {
        for (const delayMs of [0, ...POLL_DELAYS_MS]) {
          if (cancelledRef.current) return;
          if (delayMs > 0) await sleep(delayMs);
          if (cancelledRef.current) return;
          const snapshot = await fetchTopUpStatus(topUp.topUpId);
          if (isFinal(snapshot.status)) {
            // Re-render on the server, which also works out whether payments were restored.
            router.refresh();
            return;
          }
        }
        if (!cancelledRef.current) setPhase("pending");
      } catch (error) {
        if (cancelledRef.current) return;
        setPhase("error");
        setMessage(error instanceof Error ? error.message : "Unable to check top-up status.");
      }
    }

    void run();
    return () => {
      cancelledRef.current = true;
    };
  }, [final, router, topUp.topUpId]);

  const amount = formatMoneyMinor(topUp.amountMinor, topUp.currency);

  return (
    <section className="rounded-xl border border-border bg-surface p-6 text-center shadow-md">
      {topUp.status === "SUCCEEDED" ? (
        <div className="space-y-2">
          <p className="font-medium text-success-fg">
            {paymentsRestored ? "Payments restored." : "Top-up confirmed."}
          </p>
          <p className="text-sm text-fg-muted">
            {amount} was added to your wallet.
            {typeof topUp.vendorBalanceMinor === "number"
              ? ` Your balance is now ${formatMoneyMinor(topUp.vendorBalanceMinor, topUp.currency)}.`
              : null}
          </p>
          {paymentsRestored ? (
            <p className="text-sm text-fg-muted">Sales and refunds are available again.</p>
          ) : null}
        </div>
      ) : topUp.status === "FAILED" ? (
        <p className="text-danger-fg">The top-up of {amount} was not completed, so nothing was added to your wallet. You can start a new top-up from the payments page.</p>
      ) : phase === "confirming" ? (
        <p className="text-fg-muted">Confirming your top-up…</p>
      ) : phase === "pending" ? (
        <p className="text-fg-muted">
          Still confirming — this can take a moment. Check the payments page shortly, or refresh this page to try again.
        </p>
      ) : (
        <p className="text-danger-fg">{message}</p>
      )}
      <Link className="mt-4 inline-block text-sm text-brand-600 underline" href="/vendor/payments">
        Back to payments
      </Link>
    </section>
  );
}
