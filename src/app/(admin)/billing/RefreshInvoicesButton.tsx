/**
 * @fileoverview Owns the on-demand invoice refresh trigger.
 * @module app/(admin)/billing/RefreshInvoicesButton
 */

"use client";

import { useFormStatus } from "react-dom";
import { RefreshCw } from "lucide-react";

import { refreshInvoicesAction } from "./actions";

export function RefreshInvoicesButton() {
  return (
    <form action={refreshInvoicesAction}>
      <RefreshSubmitButton />
    </form>
  );
}

function RefreshSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      <RefreshCw aria-hidden className={`size-4 ${pending ? "animate-spin" : ""}`} />
      {pending ? "Refreshing..." : "Refresh"}
    </button>
  );
}
