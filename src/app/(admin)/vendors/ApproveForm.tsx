/**
 * @fileoverview Owns the Approve Form fields, validation state, and submission feedback.
 * @module app/(admin)/vendors/ApproveForm
 */

"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Check } from "lucide-react";

import { Dialog } from "@/components/ui/Dialog";

export function ApproveForm({
  action,
  applicationId,
}: {
  action: (formData: FormData) => void | Promise<void>;
  applicationId: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-success-border bg-success-bg px-3 text-sm font-medium text-success-fg transition hover:bg-success-border"
        onClick={() => setIsOpen(true)}
        type="button"
      >
        <Check aria-hidden className="size-4" />
        Approve
      </button>

      <Dialog isOpen={isOpen} onClose={() => setIsOpen(false)} title="Approve application">
        <form action={action} className="space-y-4">
          <input type="hidden" name="applicationId" value={applicationId} />
          <div>
            <label className="text-sm font-medium text-fg" htmlFor={`campus-status-${applicationId}`}>
              Does this vendor operate on campus?
            </label>
            <select
              className="mt-2 h-10 w-full rounded-md border border-border px-3 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              defaultValue=""
              id={`campus-status-${applicationId}`}
              name="campusStatus"
              required
            >
              <option disabled value="">
                Select campus status
              </option>
              <option value="ON_CAMPUS">On campus</option>
              <option value="OFF_CAMPUS">Off campus</option>
            </select>
            <p className="mt-2 text-xs text-fg-subtle">
              Only on-campus vendors can later be approved to accept UNIFY wallet payments. This
              can be corrected afterward from Payments &rarr; Applications if needed.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <button
              className="h-9 rounded-md border border-border bg-surface px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg"
              onClick={() => setIsOpen(false)}
              type="button"
            >
              Cancel
            </button>
            <ApproveSubmitButton />
          </div>
        </form>
      </Dialog>
    </>
  );
}

function ApproveSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="h-9 rounded-md bg-success-fg px-3 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? "Approving..." : "Confirm approval"}
    </button>
  );
}
