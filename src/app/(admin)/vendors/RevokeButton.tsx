"use client";

import { AlertTriangle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

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

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

  return (
    <>
      <button
        className="h-8 rounded-md border border-rose-200 bg-rose-50 px-3 text-xs font-medium text-rose-700 hover:bg-rose-100"
        type="button"
        onClick={() => setIsOpen(true)}
      >
        Revoke verifier approval
      </button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsOpen(false);
            }
          }}
        >
          <div
            aria-describedby={`revoke-vendor-description-${applicationId}`}
            aria-labelledby={`revoke-vendor-title-${applicationId}`}
            aria-modal="true"
            className="w-full max-w-md rounded-lg border border-zinc-200 bg-white shadow-xl"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4">
              <div className="flex gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-md bg-rose-50 text-rose-700">
                  <AlertTriangle className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <h2 id={`revoke-vendor-title-${applicationId}`} className="font-semibold text-zinc-950">
                    Revoke verifier approval
                  </h2>
                  <p id={`revoke-vendor-description-${applicationId}`} className="mt-1 text-sm text-zinc-600">
                    {companyName} will no longer be able to verify credentials. Their account remains available so they can view their status and reapply.
                  </p>
                </div>
              </div>
              <button
                aria-label="Close"
                className="grid size-8 shrink-0 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                type="button"
                onClick={() => setIsOpen(false)}
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>

            <form action={action} className="space-y-4 px-5 py-4">
              <input type="hidden" name="applicationId" value={applicationId} />
              <div>
                <label className="text-sm font-medium text-zinc-800" htmlFor={`revoke-notes-${applicationId}`}>
                  Reason for revocation
                </label>
                <textarea
                  autoFocus
                  className="mt-2 min-h-24 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-950"
                  id={`revoke-notes-${applicationId}`}
                  maxLength={500}
                  name="notes"
                  required
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                  type="button"
                  onClick={() => setIsOpen(false)}
                >
                  Cancel
                </button>
                <RevokeSubmitButton />
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

function RevokeSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="h-9 rounded-md bg-rose-700 px-3 text-sm font-medium text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? "Revoking..." : "Confirm revocation"}
    </button>
  );
}
