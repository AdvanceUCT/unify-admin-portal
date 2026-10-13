/**
 * @fileoverview Pay button for the public funding form, with a pending state while checkout starts.
 * @module app/(public)/fund/FundSubmitButton
 */

"use client";

import { LoaderCircle } from "lucide-react";
import { useFormStatus } from "react-dom";

/**
 * Stays pending through the server action's redirect to Paystack, so the
 * funder can't submit twice while the checkout page loads.
 */
export function FundSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      aria-disabled={pending}
      className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-70"
      disabled={pending}
      type="submit"
    >
      {pending ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : null}
      {pending ? "Redirecting to Paystack…" : "Pay"}
    </button>
  );
}
