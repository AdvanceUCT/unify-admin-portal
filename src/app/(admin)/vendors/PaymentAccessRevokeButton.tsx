/**
 * @fileoverview Branch payment-access revocation dialog.
 * @module app/(admin)/vendors/PaymentAccessRevokeButton
 */

"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { ShieldOff } from "lucide-react";

import { Dialog } from "@/components/ui/Dialog";

export function PaymentAccessRevokeButton({
  action,
  branchId,
  branchName,
  companyName,
}: {
  action: (formData: FormData) => void | Promise<void>;
  branchId: string;
  branchName: string;
  companyName: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-danger-border bg-danger-bg px-3 text-sm font-medium text-danger-fg transition hover:bg-danger-border"
        onClick={() => setIsOpen(true)}
        type="button"
      >
        <ShieldOff aria-hidden className="size-4" />
        Revoke access
      </button>

      <Dialog isOpen={isOpen} onClose={() => setIsOpen(false)} title="Revoke payment access">
        <div className="space-y-4">
          <p className="text-sm text-fg-muted">
            {companyName} will no longer be able to accept wallet payments at {branchName}.
          </p>
          <form action={action} className="space-y-4">
            <input name="branchId" type="hidden" value={branchId} />
            <div>
              <label className="text-sm font-medium text-fg" htmlFor={`payment-revoke-notes-${branchId}`}>
                Reason for revocation
              </label>
              <textarea
                className="mt-2 min-h-24 w-full rounded-md border border-border px-3 py-2 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                id={`payment-revoke-notes-${branchId}`}
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
              <RevokeSubmitButton />
            </div>
          </form>
        </div>
      </Dialog>
    </>
  );
}

function RevokeSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="h-9 rounded-md bg-danger-fg px-3 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? "Revoking..." : "Confirm revocation"}
    </button>
  );
}
