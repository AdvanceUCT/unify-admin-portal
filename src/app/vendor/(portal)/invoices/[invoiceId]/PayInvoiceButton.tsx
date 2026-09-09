/**
 * @fileoverview Provides the "Pay invoice" interaction on `/vendor/invoices/[invoiceId]`.
 * @module app/vendor/(portal)/invoices/[invoiceId]/PayInvoiceButton
 */

"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import { fetchInvoiceStatus, isSettledPaymentStatus, pollUntilSettled } from "@/app/vendor/(portal)/invoices/paymentPolling";

type AttemptResponse = { status: string; accessCode: string | null; authorizationUrl: string | null; reference: string };
type Phase = "idle" | "preparing" | "awaiting-popup" | "confirming" | "settled" | "error";

function isErrorPayload(value: unknown): value is { error: { message: string } } {
  return typeof value === "object" && value !== null && "error" in value;
}

/**
 * Opens the Paystack popup for an already-prepared attempt (never initializes
 * one client-side) and, on success, reconciles server-side and polls with
 * bounded backoff until the invoice settles — a popup "success" callback is
 * never itself treated as proof of payment.
 */
export function PayInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const [showRefresh, setShowRefresh] = useState(false);
  const cancelledRef = useRef(false);

  const reconcileAndPoll = useCallback(async () => {
    setPhase("confirming");
    setShowRefresh(false);
    try {
      await fetch(`/api/vendor/invoices/${invoiceId}/reconcile`, { method: "POST" });
    } catch {
      // A reconcile-call failure doesn't stop polling — the webhook may
      // settle it independently even if this browser call didn't land.
    }

    try {
      const settled = await pollUntilSettled(invoiceId, { isCancelled: () => cancelledRef.current });
      if (cancelledRef.current) return;
      if (settled) {
        setPhase("settled");
        router.refresh();
        return;
      }
      setShowRefresh(true);
      setMessage("Still confirming — this can take a moment. Check Refresh status, or contact support if it doesn't update.");
    } catch (error) {
      setShowRefresh(true);
      setMessage(error instanceof Error ? error.message : "Unable to check invoice status.");
    } finally {
      if (!cancelledRef.current) setPhase((current) => (current === "settled" ? current : "idle"));
    }
  }, [invoiceId, router]);

  const handleRefreshClick = useCallback(async () => {
    try {
      const snapshot = await fetchInvoiceStatus(invoiceId);
      if (isSettledPaymentStatus(snapshot.paymentStatus)) {
        setPhase("settled");
        setShowRefresh(false);
        router.refresh();
        return;
      }
      setMessage("Not confirmed yet — try again in a moment, or use Reconcile below.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to check invoice status.");
    }
  }, [invoiceId, router]);

  const handlePayClick = useCallback(async () => {
    cancelledRef.current = false;
    setPhase("preparing");
    setMessage(null);
    setShowRefresh(false);

    let data: AttemptResponse;
    try {
      const response = await fetch(`/api/vendor/invoices/${invoiceId}/payment-attempts`, { method: "POST" });
      const body: unknown = await response.json();
      if (!response.ok || isErrorPayload(body)) {
        setPhase("error");
        setMessage(isErrorPayload(body) ? body.error.message : "Unable to start payment.");
        return;
      }
      data = body as AttemptResponse;
    } catch {
      setPhase("error");
      setMessage("Unable to start payment. Check your connection and try again.");
      return;
    }

    setFallbackUrl(data.authorizationUrl);

    if (data.status !== "READY" || !data.accessCode) {
      setPhase("error");
      setMessage(
        data.status === "UNKNOWN"
          ? "We couldn't confirm the payment started. Wait a moment and try again, or use the payment link below."
          : "Unable to start payment. Please try again.",
      );
      return;
    }

    setPhase("awaiting-popup");
    const { default: PaystackPop } = await import("@paystack/inline-js");
    const popup = new PaystackPop();
    popup.resumeTransaction(data.accessCode, {
      onSuccess: () => {
        void reconcileAndPoll();
      },
      onCancel: () => {
        setPhase("idle");
        setMessage("Payment was cancelled. You can try again.");
      },
      onError: (event) => {
        setPhase("error");
        setMessage(event.message || "The payment popup reported an error.");
      },
    });
  }, [invoiceId, reconcileAndPoll]);

  const isBusy = phase === "preparing" || phase === "awaiting-popup" || phase === "confirming" || phase === "settled";
  const buttonLabel =
    phase === "preparing"
      ? "Starting..."
      : phase === "awaiting-popup"
        ? "Waiting for payment..."
        : phase === "confirming"
          ? "Confirming payment..."
          : phase === "settled"
            ? "Paid"
            : "Pay invoice";

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isBusy}
        onClick={() => void handlePayClick()}
        type="button"
      >
        {isBusy && <Loader2 aria-hidden="true" className="animate-spin" size={14} />}
        {buttonLabel}
      </button>
      {fallbackUrl && phase !== "confirming" && phase !== "settled" && (
        <a className="text-xs text-fg-muted underline" href={fallbackUrl} rel="noreferrer" target="_blank">
          Payment window didn&apos;t open? Pay via this link instead.
        </a>
      )}
      {showRefresh && (
        <button className="text-xs text-fg-muted underline" onClick={() => void handleRefreshClick()} type="button">
          Refresh status
        </button>
      )}
      {message && <p className="max-w-xs text-right text-xs text-danger-fg">{message}</p>}
    </div>
  );
}
