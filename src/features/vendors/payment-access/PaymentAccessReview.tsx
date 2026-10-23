/**
 * @fileoverview Admin review screen for one branch's payment access request.
 * @module features/vendors/payment-access/PaymentAccessReview
 */

"use client";

import { AlertTriangle, Ban, Check, History, Landmark, ScrollText } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import { BackButton } from "@/components/ui/BackButton";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { formatDateTime } from "@/lib/formatters";
import { paymentAccessSummary, type AccessActionResult, type AccessBranch, type AccessContext, type PayoutAccount } from "@/lib/payments/paymentAccessSummary";
import { AccountSummary } from "./PayoutAccountEditor";
import { accessBadgeTone, accessCard, accessCardHeader } from "./styles";

type ReviewAction = (state: AccessActionResult, data: FormData) => Promise<AccessActionResult>;
export type AccountHistoryEntry = { id: string; applicationId: string | null; at: string; previous: PayoutAccount | null; next: PayoutAccount | null };

const approveButtonClassName = "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-success-border bg-success-bg px-3 text-sm font-medium text-success-fg transition hover:bg-success-border disabled:cursor-not-allowed disabled:opacity-60";
const rejectButtonClassName = "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-danger-border bg-danger-bg px-3 text-sm font-medium text-danger-fg transition hover:bg-danger-border disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButtonClassName = "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-60";
const detailRowClassName = "grid grid-cols-[9rem_minmax(0,1fr)] gap-2";

function historyTone(status: string) {
  if (status === "APPROVED") return "success" as const;
  if (status === "PENDING") return "warning" as const;
  if (status === "REJECTED" || status === "REVOKED") return "danger" as const;
  return "neutral" as const;
}

function titleCaseStatus(status: string) {
  return status.toLowerCase().replaceAll("_", " ").replace(/^\w/, (character) => character.toUpperCase());
}

function Alert({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="flex items-start gap-3 rounded-lg border border-warning-border bg-warning-bg px-4 py-3">
      <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0 text-warning-fg" size={18} />
      <div className="min-w-0 text-sm">
        <p className="font-semibold text-fg">{title}</p>
        <div className="mt-0.5 space-y-1 text-warning-fg">{children}</div>
      </div>
    </section>
  );
}

export function PaymentAccessReview({ companyName, branch, context, history, approve, reject, headerActions }: { companyName: string; branch: AccessBranch; context: AccessContext; history: AccountHistoryEntry[]; approve: ReviewAction; reject: ReviewAction; headerActions?: React.ReactNode }) {
  const summary = paymentAccessSummary(branch, context);
  const feedback = useRef<HTMLDivElement>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [result, action, pending] = useActionState(async (state: AccessActionResult, form: FormData) => {
    let next: AccessActionResult;
    try { next = await (form.get("decision") === "approve" ? approve : reject)(state, form); }
    catch { next = { uncertain: true, error: "The decision could not be confirmed. Reload the request." }; }
    if (next.ok || next.uncertain) setRejectOpen(false);
    return next;
  }, {});
  useEffect(() => {
    if (result.error || result.message) feedback.current?.focus();
  }, [result]);
  const application = summary.application;
  const canDecide = application?.status === "PENDING" && !result.ok && !result.uncertain;

  return (
    <div className="space-y-6">
      <BackButton href="/vendors?tab=payments" label="Back to payment access" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-page-title text-fg">{companyName}</h1>
            <Badge tone={accessBadgeTone(summary)}>{summary.requestLabel}</Badge>
          </div>
          <p className="mt-1 text-sm text-fg-subtle">{branch.name} · {branch.address || "No location supplied"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canDecide ? (
            <>
              <form action={action}>
                <input name="applicationId" type="hidden" value={application.id} />
                <input name="decision" type="hidden" value="approve" />
                <input name="payoutReference" type="hidden" value={context.payoutAccount?.reference ?? ""} />
                <button className={approveButtonClassName} disabled={pending || !summary.canApprove} title={summary.canApprove ? undefined : "Resolve the issues below before approving."} type="submit">
                  <Check aria-hidden className="size-4" />
                  {pending ? "Saving decision…" : "Approve branch"}
                </button>
              </form>
              <button className={rejectButtonClassName} disabled={pending} onClick={() => setRejectOpen(true)} type="button">
                <Ban aria-hidden className="size-4" />
                Reject request
              </button>
            </>
          ) : null}
          {result.uncertain ? (
            <button className={secondaryButtonClassName} onClick={() => window.location.reload()} type="button">Reload current decision</button>
          ) : null}
          {headerActions}
        </div>
      </div>

      <div
        className={`rounded-lg border px-4 py-3 text-sm empty:hidden ${result.error ? "border-danger-border bg-danger-bg text-danger-fg" : "border-success-border bg-success-bg text-success-fg"}`}
        ref={feedback}
        role={result.error ? "alert" : "status"}
        tabIndex={-1}
      >
        {rejectOpen ? null : result.error || result.message}
      </div>

      {context.paymentStatus === "SUSPENDED" ? (
        <Alert title="Vendor payments are suspended">
          <p>{context.suspensionReason || "Existing vendor restrictions remain in effect."}</p>
          <p>Approving this branch will not restore vendor payments.</p>
        </Alert>
      ) : null}
      {summary.blockers.length > 0 ? (
        <Alert title="This branch can't be approved yet">
          {summary.blockers.map((text) => <p key={text}>{text}</p>)}
        </Alert>
      ) : null}

      <div className="grid items-stretch gap-6 lg:grid-cols-2">
        <section className={accessCard}>
          <div className={accessCardHeader}>
            <div className="flex items-center gap-2">
              <Landmark aria-hidden className="size-5 text-brand-700" />
              <h2 className="text-section-title text-fg">Submitted payout account</h2>
            </div>
          </div>
          <div className="space-y-4 p-5">
            <AccountSummary account={application?.payoutAccount ?? null} />
            {summary.needsReconfirmation ? (
              <div className="space-y-3 rounded-lg border border-warning-border bg-warning-bg px-4 py-3 text-sm">
                <div>
                  <p className="font-semibold text-fg">Owner confirmation required</p>
                  <p className="mt-0.5 text-warning-fg">The account changed or the original request is incomplete. Approval is blocked until the owner confirms.</p>
                </div>
                <p className="font-medium text-fg">Current payout account</p>
                <AccountSummary account={context.payoutAccount} />
              </div>
            ) : null}
            <p className="text-xs text-fg-subtle">Payout accounts are shared across this vendor&apos;s branches.</p>
          </div>
        </section>

        <section className={accessCard}>
          <div className={accessCardHeader}>
            <div className="flex items-center gap-2">
              <ScrollText aria-hidden className="size-5 text-brand-700" />
              <h2 className="text-section-title text-fg">Request details</h2>
            </div>
          </div>
          <div className="p-5">
            <dl className="grid gap-2 rounded-lg border border-border bg-surface-muted p-3 text-sm">
              <div className={detailRowClassName}>
                <dt className="text-fg-subtle">Request reference</dt>
                <dd className="break-all font-mono text-xs text-fg">{application?.id || "No submitted request"}</dd>
              </div>
              <div className={detailRowClassName}>
                <dt className="text-fg-subtle">Submitted</dt>
                <dd className="font-medium text-fg">{application?.submittedAt ? formatDateTime(application.submittedAt) : "Not submitted"}</dd>
              </div>
              <div className={detailRowClassName}>
                <dt className="text-fg-subtle">Acknowledgement</dt>
                <dd>
                  <Badge tone={application?.acknowledged ? "success" : "danger"}>{application?.acknowledged ? "Accepted" : "Missing"}</Badge>
                </dd>
              </div>
            </dl>
          </div>
        </section>
      </div>

      <section className={accessCard}>
        <div className={accessCardHeader}>
          <div className="flex items-center gap-2">
            <History aria-hidden className="size-5 text-brand-700" />
            <h2 className="text-section-title text-fg">Request history</h2>
          </div>
          <p className="text-sm text-fg-muted">{branch.applications.length} request{branch.applications.length === 1 ? "" : "s"}</p>
        </div>
        <div className="divide-y divide-border">
          {branch.applications.map((app) => (
            <div className="space-y-1.5 px-5 py-4 text-sm" key={app.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge tone={historyTone(app.status)}>{titleCaseStatus(app.status)}</Badge>
                {app.reviewedAt ? <p className="text-xs text-fg-subtle">Reviewed {formatDateTime(app.reviewedAt)}</p> : null}
              </div>
              <p className="break-all font-mono text-xs text-fg-subtle">{app.id}</p>
              {app.reviewNotes || app.revokedNotes ? <p className="whitespace-pre-wrap text-fg-muted">{app.reviewNotes || app.revokedNotes}</p> : null}
            </div>
          ))}
          {history.map((entry) => (
            <details className="px-5 py-4" key={entry.id}>
              <summary className="cursor-pointer text-sm font-medium text-fg-muted hover:text-fg">Account reconfirmed {formatDateTime(entry.at)}</summary>
              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <div className="space-y-2"><p className="text-fg-subtle">Previous submission</p><AccountSummary account={entry.previous} /></div>
                <div className="space-y-2"><p className="text-fg-subtle">Reconfirmed account</p><AccountSummary account={entry.next} /></div>
              </div>
            </details>
          ))}
          {branch.applications.length === 0 ? <p className="px-5 py-6 text-sm text-fg-subtle">No requests yet.</p> : null}
        </div>
      </section>

      {application ? (
        <Dialog isOpen={rejectOpen} onClose={() => { if (!pending) setRejectOpen(false); }} title="Reject payment access request">
          <form action={action} className="space-y-4">
            <input name="applicationId" type="hidden" value={application.id} />
            <input name="decision" type="hidden" value="reject" />
            <div>
              <label className="text-sm font-medium text-fg" htmlFor={`payment-reject-notes-${application.id}`}>Reason shown to vendor</label>
              <textarea
                className="mt-2 min-h-24 w-full rounded-md border border-border px-3 py-2 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                id={`payment-reject-notes-${application.id}`}
                maxLength={500}
                name="notes"
                required
              />
            </div>
            {result.error ? <p className="rounded-lg border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-fg" role="alert">{result.error}</p> : null}
            <div className="flex justify-end gap-2">
              <button className={secondaryButtonClassName} disabled={pending} onClick={() => setRejectOpen(false)} type="button">Cancel</button>
              <button className="h-9 rounded-md bg-danger-fg px-3 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60" disabled={pending} type="submit">
                {pending ? "Saving decision…" : "Confirm rejection"}
              </button>
            </div>
          </form>
        </Dialog>
      ) : null}
    </div>
  );
}
