"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import { Dialog } from "@/components/ui/Dialog";

export function RevokeButton({
  action,
  applicationId,
  companyName,
}: {
  action: (formData: FormData) => void | Promise<void>;
  applicationId: string;
  companyName: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        className="h-9 rounded-md border border-danger-border bg-danger-bg px-3 text-sm font-medium text-danger-fg transition hover:bg-danger-border"
        onClick={() => setIsOpen(true)}
        type="button"
      >
        Revoke verifier approval
      </button>

      <Dialog isOpen={isOpen} onClose={() => setIsOpen(false)} title="Revoke verifier approval">
        <div className="space-y-4">
          <p className="text-sm text-fg-muted">
            {companyName} will no longer be able to verify credentials. Their account remains
            available so they can view their status and reapply.
          </p>
          <form action={action} className="space-y-4">
            <input type="hidden" name="applicationId" value={applicationId} />
            <div>
              <label className="text-sm font-medium text-fg" htmlFor={`revoke-notes-${applicationId}`}>
                Reason for revocation
              </label>
              <textarea
                className="mt-2 min-h-24 w-full rounded-md border border-border px-3 py-2 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                id={`revoke-notes-${applicationId}`}
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
