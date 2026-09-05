/**
 * @fileoverview Owns the send-invoice-to-vendor button, request state, and feedback.
 * @module app/(admin)/billing/SendInvoiceButton
 */

"use client";

import { useState } from "react";
import { Send } from "lucide-react";

export function SendInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function handleSend() {
    setState("sending");
    try {
      const response = await fetch(`/api/admin/invoices/${invoiceId}/send`, { method: "POST" });
      setState(response.ok ? "sent" : "error");
      if (state !== "error") {
        setTimeout(() => setState("idle"), 3000);
      }
    } catch {
      setState("error");
    }
  }

  return (
    <button
      className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-60"
      disabled={state === "sending"}
      onClick={handleSend}
      title={state === "error" ? "Could not send. Try again." : "Email this invoice to the vendor"}
      type="button"
    >
      <Send aria-hidden className="size-4" />
      {state === "sending" ? "Sending..." : state === "sent" ? "Sent" : state === "error" ? "Failed" : "Send"}
    </button>
  );
}
