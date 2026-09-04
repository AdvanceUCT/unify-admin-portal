/**
 * @fileoverview Owns the Reinstate Vendor submit button and pending state.
 * @module app/(admin)/billing/ReinstateVendorButton
 */

"use client";

import { useFormStatus } from "react-dom";
import { CheckCircle } from "lucide-react";

import { reinstateVendorAction } from "./actions";

export function ReinstateVendorButton({ vendorProfileId }: { vendorProfileId: string }) {
  return (
    <form action={reinstateVendorAction}>
      <input type="hidden" name="vendorProfileId" value={vendorProfileId} />
      <ReinstateSubmitButton />
    </form>
  );
}

function ReinstateSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-success-border bg-success-bg px-3 text-sm font-medium text-success-fg transition hover:bg-success-border disabled:cursor-not-allowed disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      <CheckCircle aria-hidden className="size-4" />
      {pending ? "Reinstating..." : "Reinstate"}
    </button>
  );
}
