/**
 * @fileoverview Toggles a vendor's payment-acceptance access from the Active Vendors list.
 * @module app/(admin)/vendors/PaymentAccessToggle
 */

"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import type { VendorApplicationStatus } from "@/generated/prisma/enums";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/cn";

function ToggleThumb({ isOn }: { isOn: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex h-6 w-11 shrink-0 items-center rounded-full transition",
        isOn ? "bg-success-fg" : "bg-border-strong",
      )}
    >
      <span
        className={cn(
          "inline-block size-4 transform rounded-full bg-white shadow transition",
          isOn ? "translate-x-6" : "translate-x-1",
        )}
      />
    </span>
  );
}

/**
 * Reflects paymentAcceptanceStatus === "APPROVED" (on) vs anything else (off).
 * Calls the same approve/revoke paths the review queue already uses — no new
 * status, no new logic. Only two directions are wired to an actual click:
 *
 * - APPROVED -> off: the existing revoke path (reviewVendorPaymentApplication
 *   only accepts APPROVED as the starting state for revocation, which is
 *   exactly where this is).
 * - PENDING -> on: the existing approve path (reviewVendorPaymentApplication
 *   only accepts PENDING as the starting state for approval).
 *
 * null / REJECTED / REVOKED render off and disabled: there is no existing
 * single admin action that moves any of those states to APPROVED (approval
 * requires PENDING) — the vendor would need to submit a fresh request first.
 * Silently allowing that here would mean either fabricating a new status
 * transition or quietly resetting REVOKED back to PENDING, neither of which
 * this component decides on its own.
 */
export function PaymentAccessToggle({
  approveAction,
  revokeAction,
  applicationId,
  companyName,
  status,
}: {
  approveAction: (formData: FormData) => void | Promise<void>;
  revokeAction: (formData: FormData) => void | Promise<void>;
  applicationId: string | null;
  companyName: string;
  status: VendorApplicationStatus | null;
}) {
  const [isRevokeOpen, setIsRevokeOpen] = useState(false);

  if (status === "APPROVED" && applicationId) {
    return (
      <>
        <button
          aria-checked="true"
          aria-label={`Revoke ${companyName}'s payment acceptance`}
          className="rounded-full"
          onClick={() => setIsRevokeOpen(true)}
          role="switch"
          type="button"
        >
          <ToggleThumb isOn />
        </button>

        <Dialog isOpen={isRevokeOpen} onClose={() => setIsRevokeOpen(false)} title="Revoke payment acceptance">
          <div className="space-y-4">
            <p className="text-sm text-fg-muted">
              {companyName} will no longer be able to accept UNIFY wallet payments on campus.
            </p>
            <form action={revokeAction} className="space-y-4">
              <input type="hidden" name="applicationId" value={applicationId} />
              <div>
                <label className="text-sm font-medium text-fg" htmlFor={`revoke-payment-notes-${applicationId}`}>
                  Reason for revocation
                </label>
                <textarea
                  className="mt-2 min-h-24 w-full rounded-md border border-border px-3 py-2 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  id={`revoke-payment-notes-${applicationId}`}
                  maxLength={500}
                  name="notes"
                  required
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  className="h-9 rounded-md border border-border bg-surface px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg"
                  onClick={() => setIsRevokeOpen(false)}
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

  if (status === "PENDING" && applicationId) {
    return (
      <form action={approveAction}>
        <input type="hidden" name="applicationId" value={applicationId} />
        <ApproveSubmitToggle companyName={companyName} />
      </form>
    );
  }

  return (
    <span
      aria-checked="false"
      aria-label={`${companyName} has no pending payment-acceptance request to approve`}
      role="switch"
      title="No pending payment-acceptance request — the vendor needs to apply before this can be turned on."
    >
      <ToggleThumb isOn={false} />
    </span>
  );
}

function ApproveSubmitToggle({ companyName }: { companyName: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      aria-checked="false"
      aria-label={`Approve ${companyName}'s pending payment-acceptance request`}
      className={cn("rounded-full", pending && "cursor-not-allowed opacity-60")}
      disabled={pending}
      role="switch"
      type="submit"
    >
      <ToggleThumb isOn={false} />
    </button>
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
