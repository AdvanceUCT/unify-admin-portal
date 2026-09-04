/**
 * @fileoverview Owns the Flag Invoice dialog, notes field, and submission feedback.
 * @module app/(admin)/billing/FlagInvoiceButton
 */

"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Flag } from "lucide-react";

import { Dialog } from "@/components/ui/Dialog";
import { flagInvoiceAction } from "./actions";

export function FlagInvoiceButton({
  disabled,
  invoiceId,
  vendorName,
}: {
  disabled?: boolean;
  invoiceId: string;
  vendorName: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-warning-border bg-warning-bg px-3 text-sm font-medium text-warning-fg transition hover:bg-warning-border disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled}
        onClick={() => setIsOpen(true)}
        type="button"
      >
        <Flag aria-hidden className="size-4" />
        Flag
      </button>

      <Dialog isOpen={isOpen} onClose={() => setIsOpen(false)} title={`Flag invoice — ${vendorName}`}>
        <form action={flagInvoiceAction} className="space-y-4">
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <div>
            <label className="text-sm font-medium text-fg" htmlFor={`flag-notes-${invoiceId}`}>
              Reason for flagging
            </label>
            <textarea
              className="mt-2 min-h-24 w-full rounded-md border border-border px-3 py-2 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              id={`flag-notes-${invoiceId}`}
              maxLength={500}
              name="notes"
              required
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              className="h-9 rounded-md border border-border bg-surface px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg"
              onClick={() => setIsOpen(false)}
              type="button"
            >
              Cancel
            </button>
            <FlagSubmitButton />
          </div>
        </form>
      </Dialog>
    </>
  );
}

function FlagSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="h-9 rounded-md bg-warning-fg px-3 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? "Flagging..." : "Confirm flag"}
    </button>
  );
}
