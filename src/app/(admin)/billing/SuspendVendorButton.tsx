/**
 * @fileoverview Owns the Suspend Vendor confirmation dialog and submission feedback.
 * @module app/(admin)/billing/SuspendVendorButton
 */

"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Ban } from "lucide-react";

import { Dialog } from "@/components/ui/Dialog";
import { suspendVendorAction } from "./actions";

export function SuspendVendorButton({
  disabled,
  invoiceId,
  vendorName,
  vendorProfileId,
}: {
  disabled?: boolean;
  invoiceId: string;
  vendorName: string;
  vendorProfileId: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-danger-border bg-danger-bg px-3 text-sm font-medium text-danger-fg transition hover:bg-danger-border disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled}
        onClick={() => setIsOpen(true)}
        type="button"
      >
        <Ban aria-hidden className="size-4" />
        Suspend
      </button>

      <Dialog isOpen={isOpen} onClose={() => setIsOpen(false)} title="Suspend vendor">
        <div className="space-y-4">
          <p className="text-sm text-fg-muted">
            Suspend {vendorName}? Their verification QR will stop working immediately.
          </p>
          <form action={suspendVendorAction} className="space-y-4">
            <input type="hidden" name="invoiceId" value={invoiceId} />
            <input type="hidden" name="vendorProfileId" value={vendorProfileId} />
            <div className="flex justify-end gap-2">
              <button
                className="h-9 rounded-md border border-border bg-surface px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg"
                onClick={() => setIsOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <SuspendSubmitButton />
            </div>
          </form>
        </div>
      </Dialog>
    </>
  );
}

function SuspendSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="h-9 rounded-md bg-danger-fg px-3 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? "Suspending..." : "Confirm suspension"}
    </button>
  );
}
