/**
 * @fileoverview Owner flow for requesting wallet payment access for one branch.
 * @module features/vendors/payment-access/PaymentAccessPage
 */

"use client";
import { formatSastDateTime } from "@/lib/formatters/time";


import { AlertTriangle, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import { BackButton } from "@/components/ui/BackButton";
import { Badge } from "@/components/ui/Badge";
import { PAYMENT_ACCESS_ACKNOWLEDGEMENT, paymentAccessSummary, type AccessActionResult, type AccessBranch, type AccessContext } from "@/lib/payments/paymentAccessSummary";
import { AccountSummary, PayoutAccountEditor, type PayoutEditorActions } from "./PayoutAccountEditor";
import { accessBadgeTone, accessButton, accessCard, accessCardHeader, accessSecondaryButton } from "./styles";

function StepHeader({ action, step, title }: { action?: React.ReactNode; step: number; title: string }) {
  return (
    <div className={accessCardHeader}>
      <div className="flex items-center gap-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">{step}</span>
        <h2 className="text-section-title text-fg">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function PaymentAccessPage({ branch, context, submitRequest, saveAccount, loadBanks }: PayoutEditorActions & { branch: AccessBranch; context: AccessContext; submitRequest: (state: AccessActionResult, data: FormData) => Promise<AccessActionResult> }) {
  const [accountBlocked, setAccountBlocked] = useState(false);
  const [account, setAccount] = useState(context.payoutAccount);
  const summary = paymentAccessSummary(branch, { ...context, payoutAccount: account });
  const feedback = useRef<HTMLDivElement>(null);
  const [result, action, pending] = useActionState(async (state: AccessActionResult, data: FormData) => {
    try { return await submitRequest(state, data); } catch { return { uncertain: true, error: "We could not confirm submission. Reload to check your request." }; }
  }, {});
  useEffect(() => { if (result.error || result.message) feedback.current?.focus(); }, [result]);
  const application = summary.application;
  const submitted = result.ok || application?.status === "PENDING";
  const canSend = !result.ok && !accountBlocked && (summary.canSubmit || summary.canReconfirm);
  const label = result.ok ? "In review" : summary.requestLabel;

  return (
    <div className="space-y-6">
      <BackButton href="/vendor/payments/access" label="Back to payment access" />

      <section className="rounded-xl border border-border bg-surface p-5 shadow-md">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-page-title text-fg">Payment access</h1>
            <p className="mt-1 text-sm text-fg-subtle">{branch.name}</p>
          </div>
          <Badge tone={result.ok ? "neutral" : accessBadgeTone(summary)}>{label}</Badge>
        </div>
      </section>

      {summary.paused ? (
        <section className="flex flex-col gap-3 rounded-lg border border-warning-border bg-warning-bg px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0 text-warning-fg" size={18} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-fg">Payments paused</p>
              <p className="mt-0.5 text-sm text-warning-fg">{summary.paused}</p>
            </div>
          </div>
          <Link className={accessButton} href={summary.recoveryHref}>
            {context.suspensionCode === "OVERDRAFT" ? "Restore wallet balance" : "Get help"}
          </Link>
        </section>
      ) : null}

      {summary.paymentReady ? (
        <section className="flex flex-col gap-3 rounded-lg border border-success-border bg-success-bg px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <CheckCircle2 aria-hidden="true" className="mt-0.5 shrink-0 text-success-fg" size={18} />
            <p className="text-sm font-medium text-fg">This branch can accept wallet payments.</p>
          </div>
          <Link className={accessButton} href="/vendor/integrations/payments#setup">Continue payment setup</Link>
        </section>
      ) : null}

      <section className={accessCard}>
        <StepHeader
          action={<Link className={accessSecondaryButton} href={`/vendor/branches/${branch.id}`}>View or edit branch</Link>}
          step={1}
          title="Branch"
        />
        <div className="space-y-1 p-5">
          <p className="font-medium text-fg">{branch.name}</p>
          <p className="text-sm text-fg-muted">{branch.address || "No location supplied"}</p>
          {summary.blockers.map((text) => <p className="text-sm text-warning-fg" key={text}>{text}</p>)}
        </div>
      </section>

      <section className={accessCard}>
        <StepHeader step={2} title="Payout account" />
        <div className="p-5">
          <PayoutAccountEditor key={context.payoutAccount?.reference ?? "new"} account={account} saveAccount={saveAccount} loadBanks={loadBanks} onSaved={setAccount} onStateChange={setAccountBlocked} />
        </div>
      </section>

      <section className={accessCard}>
        <StepHeader step={3} title={summary.approved ? "Decision" : submitted && !summary.needsReconfirmation ? "Request status" : "Review and submit"} />
        <div className="space-y-4 p-5">
          {application?.reviewNotes ? (
            <div className="rounded-lg border border-warning-border bg-warning-bg px-4 py-3 text-sm">
              <p className="font-semibold text-fg">University feedback</p>
              <p className="mt-1 whitespace-pre-wrap text-warning-fg">{application.reviewNotes}</p>
            </div>
          ) : null}
          {application?.revokedNotes ? <p className="text-sm text-fg-muted">{application.revokedNotes}</p> : null}
          {summary.needsReconfirmation && !result.ok ? (
            <div className="space-y-3 rounded-lg border border-warning-border bg-warning-bg px-4 py-3 text-sm">
              <div>
                <p className="font-semibold text-fg">Confirm the updated payout account</p>
                <p className="mt-1 text-warning-fg">The account changed or this request is incomplete. Review the current account above before confirming.</p>
              </div>
              <p className="text-fg-muted">Previously submitted</p>
              <AccountSummary account={application?.payoutAccount ?? null} />
            </div>
          ) : null}
          {application || result.applicationId ? (
            <dl className="grid gap-2 rounded-lg border border-border bg-surface-muted p-3 text-sm">
              <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-2">
                <dt className="text-fg-subtle">Request reference</dt>
                <dd className="break-all font-mono text-xs text-fg">{result.applicationId ?? application?.id}</dd>
              </div>
              {application?.submittedAt ? (
                <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-2">
                  <dt className="text-fg-subtle">Submitted</dt>
                  <dd className="font-medium text-fg">{formatSastDateTime(application.submittedAt)}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
          {submitted && !summary.needsReconfirmation && !summary.approved ? (
            <p className="text-sm text-fg-muted">Awaiting university review. We will email you when a decision is made.</p>
          ) : null}
          <div
            className={`rounded-lg border px-3 py-2 text-sm empty:hidden ${result.error ? "border-danger-border bg-danger-bg text-danger-fg" : "border-success-border bg-success-bg text-success-fg"}`}
            ref={feedback}
            role={result.error ? "alert" : "status"}
            tabIndex={-1}
          >
            {result.error || result.message}
          </div>
          {result.uncertain ? (
            <button className={accessButton} onClick={() => window.location.reload()} type="button">Reload request status</button>
          ) : canSend ? (
            <form action={action} aria-label="Submit payment-access request" className="space-y-4">
              <input name="branchId" type="hidden" value={branch.id} />
              <input name="payoutReference" type="hidden" value={account?.reference ?? ""} />
              {summary.needsReconfirmation ? <input name="reconfirmApplicationId" type="hidden" value={application!.id} /> : null}
              <p className="text-sm text-fg">
                Request access for <strong>{branch.name}</strong> using {account?.bankName || "the saved bank account"} {account?.accountMask}.
              </p>
              <label className="flex items-start gap-3 rounded-lg border border-border bg-surface-muted p-3 text-sm text-fg">
                <input className="mt-0.5 size-4 shrink-0" name="acknowledgement" required type="checkbox" />
                {PAYMENT_ACCESS_ACKNOWLEDGEMENT}
              </label>
              <button className={accessButton} disabled={pending} type="submit">
                {pending ? "Submitting…" : summary.needsReconfirmation ? "Confirm updated account" : application?.status === "REJECTED" || application?.status === "REVOKED" ? "Update and resubmit" : "Submit for review"}
              </button>
            </form>
          ) : !submitted && !summary.approved && !account ? (
            <p className="text-sm text-fg-muted">Save a payout account to continue.</p>
          ) : null}
        </div>
      </section>

      {branch.applications.length > 1 ? (
        <section className={accessCard}>
          <details>
            <summary className="flex cursor-pointer items-center justify-between gap-3 px-5 py-4 text-section-title text-fg">
              Previous requests
              <span className="text-sm font-normal text-fg-muted">{branch.applications.length - 1}</span>
            </summary>
            <ul className="divide-y divide-border border-t border-border">
              {branch.applications.slice(1).map((app) => (
                <li className="space-y-1 px-5 py-3 text-sm" key={app.id}>
                  <p className="font-medium text-fg">
                    {app.status.replaceAll("_", " ")} · {app.submittedAt ? formatSastDateTime(app.submittedAt) : "Earlier request"}
                  </p>
                  {app.reviewNotes ? <p className="text-fg-muted">{app.reviewNotes}</p> : null}
                </li>
              ))}
            </ul>
          </details>
        </section>
      ) : null}
    </div>
  );
}
