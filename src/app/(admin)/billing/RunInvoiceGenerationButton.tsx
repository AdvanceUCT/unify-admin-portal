/**
 * @fileoverview Owns the manual trigger for the automated monthly invoice run.
 * @module app/(admin)/billing/RunInvoiceGenerationButton
 */

"use client";

import { useFormStatus } from "react-dom";
import { RefreshCw } from "lucide-react";

import { runInvoiceGenerationAction } from "./actions";

export function RunInvoiceGenerationButton() {
  return (
    <form action={runInvoiceGenerationAction}>
      <RunSubmitButton />
    </form>
  );
}

function RunSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      <RefreshCw aria-hidden className={`size-4 ${pending ? "animate-spin" : ""}`} />
      {pending ? "Running..." : "Run now"}
    </button>
  );
}
