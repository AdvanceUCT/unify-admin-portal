/**
 * @fileoverview Owns review of a PENDING, justification-based payment-acceptance request.
 * @module app/(admin)/vendors/payment-access/[partnershipId]/PendingApplicationReview
 */

"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, X } from "lucide-react";

import { Dialog } from "@/components/ui/Dialog";

/**
 * Everything specific to today's justification-based request flow lives in
 * this one file: the justification copy, and the approve/reject actions
 * that resolve a PENDING application. A different branch is expected to
 * replace this flow with bank-details submission, at which point this
 * component can be deleted (or rewritten) wholesale without touching the
 * rest of the payment-access detail page — the page only needs to know
 * "render this when status is PENDING," not how PENDING gets resolved.
 */
export function PendingApplicationReview({
  applicationId,
  approveAction,
  companyName,
  justification,
  rejectAction,
}: {
  applicationId: string;
  approveAction: (formData: FormData) => void | Promise<void>;
  companyName: string;
  justification: string | null;
  rejectAction: (formData: FormData) => void | Promise<void>;
}) {
  const [isRejectOpen, setIsRejectOpen] = useState(false);

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-section-title text-fg">Payment-acceptance request</h2>
        <p className="mt-1 text-sm text-fg-subtle">
          {companyName} is requesting to accept UNIFY wallet payments on campus.
        </p>
      </div>
      <div className="space-y-4 p-5">
        {justification ? (
          <div>
            <p className="text-caption font-medium uppercase tracking-wide text-fg-subtle">
              Justification
            </p>
            <p className="mt-1.5 text-sm text-fg-muted">{justification}</p>
          </div>
        ) : (
          <p className="text-sm text-fg-subtle">No justification was provided.</p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <form action={approveAction}>
            <input type="hidden" name="applicationId" value={applicationId} />
            <ApproveSubmitButton />
          </form>

          <button
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-danger-border bg-danger-bg px-3 text-sm font-medium text-danger-fg transition hover:bg-danger-border"
            onClick={() => setIsRejectOpen(true)}
            type="button"
          >
            <X aria-hidden className="size-4" />
            Reject
          </button>
        </div>
      </div>

      <Dialog isOpen={isRejectOpen} onClose={() => setIsRejectOpen(false)} title="Reject payment-acceptance request">
        <form action={rejectAction} className="space-y-4">
          <input type="hidden" name="applicationId" value={applicationId} />
          <div>
            <label className="text-sm font-medium text-fg" htmlFor={`reject-payment-notes-${applicationId}`}>
              Reason for rejection
            </label>
            <textarea
              className="mt-2 min-h-24 w-full rounded-md border border-border px-3 py-2 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              id={`reject-payment-notes-${applicationId}`}
              maxLength={500}
              name="notes"
              required
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              className="h-9 rounded-md border border-border bg-surface px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg"
              onClick={() => setIsRejectOpen(false)}
              type="button"
            >
              Cancel
            </button>
            <RejectSubmitButton />
          </div>
        </form>
      </Dialog>
    </section>
  );
}

function ApproveSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-success-border bg-success-bg px-3 text-sm font-medium text-success-fg transition hover:bg-success-border disabled:cursor-not-allowed disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      <Check aria-hidden className="size-4" />
      {pending ? "Approving..." : "Approve"}
    </button>
  );
}

function RejectSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="h-9 rounded-md bg-danger-fg px-3 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? "Rejecting..." : "Confirm rejection"}
    </button>
  );
}
