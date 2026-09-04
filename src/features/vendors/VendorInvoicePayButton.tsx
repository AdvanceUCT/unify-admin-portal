/**
 * @fileoverview Initiates Paystack checkout for a vendor invoice and redirects the browser there.
 * @module features/vendors/VendorInvoicePayButton
 */

"use client";

import { useState } from "react";

export function VendorInvoicePayButton({
  invoiceId,
  totalCents,
  isOverdue,
}: {
  invoiceId: string;
  totalCents: number;
  isOverdue: boolean;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountZar = `R ${(totalCents / 100).toFixed(2)}`;

  async function handlePay() {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/vendor/invoices/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Could not initiate payment. Please try again.");
        setIsLoading(false);
        return;
      }

      const { paymentUrl } = await response.json();

      // Full browser redirect to Paystack checkout — this is a web app, not a WebView.
      window.location.href = paymentUrl;
    } catch {
      setError("Network error. Please check your connection and try again.");
      setIsLoading(false);
    }
  }

  return (
    <div>
      {error && <p className="mb-2 text-sm text-danger-fg">{error}</p>}

      <button
        className={
          isOverdue
            ? "flex h-12 w-full items-center justify-center rounded-md bg-danger-fg text-base font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            : "flex h-12 w-full items-center justify-center rounded-md bg-brand-600 text-base font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        }
        disabled={isLoading}
        onClick={handlePay}
        type="button"
      >
        {isLoading ? "Preparing payment..." : `Pay ${amountZar}`}
      </button>

      {isOverdue && (
        <p className="mt-2 text-sm text-warning-fg">
          ⚠ Your verification access may be suspended if this invoice is not paid
        </p>
      )}
    </div>
  );
}
