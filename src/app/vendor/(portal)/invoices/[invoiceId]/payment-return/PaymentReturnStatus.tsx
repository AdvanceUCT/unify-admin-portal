/**
 * @fileoverview Auto-reconciles and polls invoice status on return from the Paystack hosted checkout page.
 * @module app/vendor/(portal)/invoices/[invoiceId]/payment-return/PaymentReturnStatus
 */

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { isSettledPaymentStatus, pollUntilSettled } from "@/app/vendor/(portal)/invoices/paymentPolling";

type Phase = "confirming" | "settled" | "pending" | "error";

/**
 * The browser return is only ever a hint, never proof — the real
 * confirmation is server-authoritative (via `confirmInvoicePayment`, which
 * this triggers through the owner-scoped reconcile route) and would settle
 * the invoice even if the visitor closed this tab before it loaded.
 */
export function PaymentReturnStatus({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("confirming");
  const [message, setMessage] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

    async function run() {
      try {
        await fetch(`/api/vendor/invoices/${invoiceId}/reconcile`, { method: "POST" });
      } catch {
        // Ignore — the webhook may settle this independently of this call.
      }

      try {
        const settled = await pollUntilSettled(invoiceId, { isCancelled: () => cancelledRef.current });
        if (cancelledRef.current) return;
        if (settled && isSettledPaymentStatus(settled.paymentStatus)) {
          setPhase("settled");
          router.refresh();
          return;
        }
        setPhase("pending");
      } catch (error) {
        if (cancelledRef.current) return;
        setPhase("error");
        setMessage(error instanceof Error ? error.message : "Unable to check invoice status.");
      }
    }

    void run();
    return () => {
      cancelledRef.current = true;
    };
  }, [invoiceId, router]);

  return (
    <section className="rounded-xl border border-border bg-surface p-6 text-center shadow-md">
      {phase === "confirming" && <p className="text-fg-muted">Confirming your payment…</p>}
      {phase === "settled" && <p className="font-medium text-success-fg">Payment confirmed. Thank you!</p>}
      {phase === "pending" && (
        <p className="text-fg-muted">
          Still confirming — this can take a moment. Check the invoice page shortly, or refresh this page to try again.
        </p>
      )}
      {phase === "error" && <p className="text-danger-fg">{message}</p>}
      <Link className="mt-4 inline-block text-sm text-brand-600 underline" href={`/vendor/invoices/${invoiceId}`}>
        Back to invoice
      </Link>
    </section>
  );
}
