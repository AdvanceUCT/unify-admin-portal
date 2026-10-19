"use client";
import { accessButton } from "./styles";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { PAYMENT_ACCESS_ACKNOWLEDGEMENT, paymentAccessSummary, type AccessActionResult, type AccessBranch, type AccessContext } from "@/lib/payments/paymentAccessSummary";
import { AccountSummary, PayoutAccountEditor, type PayoutEditorActions } from "./PayoutAccountEditor";

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
  return <div className="mx-auto max-w-3xl space-y-6">
    <Link href="/vendor/payments/access" className="text-sm text-fg-muted underline">All payment-access requests</Link>
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-page-title text-fg">Payment access</h1><p className="mt-1 text-sm text-fg-muted">{branch.name}</p></div><Badge tone={summary.approved ? "success" : summary.needsReconfirmation || application?.status === "REJECTED" ? "warning" : "neutral"}>{label}</Badge></header>
    {summary.paused && <div className="space-y-2 border-l-2 border-warning-border bg-warning-bg p-4 text-sm"><p className="font-semibold">Payments paused</p><p>{summary.paused}</p><Link href={summary.recoveryHref} className="underline">{context.suspensionCode === "OVERDRAFT" ? "Restore wallet balance" : "Get help"}</Link></div>}
    {summary.paymentReady && <div className="flex flex-wrap items-center justify-between gap-3 border-l-2 border-success-border bg-success-bg p-4 text-sm"><p>This branch can accept wallet payments.</p><Link href="/vendor/integrations/payments#setup" className="font-medium underline">Continue payment setup</Link></div>}
    <section className="space-y-3 border-t border-border pt-5"><div className="flex items-center justify-between gap-3"><h2 className="text-section-title">1. Branch</h2><Link href={`/vendor/branches/${branch.id}`} className="min-h-11 content-center text-sm underline">View or edit branch</Link></div><p className="font-medium">{branch.name}</p><p className="text-sm text-fg-muted">{branch.address || "No location supplied"}</p>{summary.blockers.map(text => <p key={text} className="text-sm text-warning-fg">{text}</p>)}</section>
    <section className="space-y-4 border-t border-border pt-5"><h2 className="text-section-title">2. Payout account</h2><PayoutAccountEditor key={context.payoutAccount?.reference ?? "new"} account={account} saveAccount={saveAccount} loadBanks={loadBanks} onSaved={setAccount} onStateChange={setAccountBlocked} /></section>
    <section className="space-y-4 border-t border-border pt-5"><h2 className="text-section-title">3. {summary.approved ? "Decision" : submitted && !summary.needsReconfirmation ? "Request status" : "Review and submit"}</h2>
      {application?.reviewNotes && <div className="border-l-2 border-warning-border bg-warning-bg p-4 text-sm"><p className="font-medium">University feedback</p><p className="mt-1 whitespace-pre-wrap">{application.reviewNotes}</p></div>}
      {application?.revokedNotes && <p className="text-sm text-fg-muted">{application.revokedNotes}</p>}
      {summary.needsReconfirmation && !result.ok && <div className="space-y-3 rounded-md bg-warning-bg p-4 text-sm"><p className="font-medium">Confirm the updated payout account</p><p>The account changed or this request is incomplete. Review the current account above before confirming.</p><p className="text-fg-muted">Previously submitted</p><AccountSummary account={application?.payoutAccount ?? null} /></div>}
      {(application || result.applicationId) && <dl className="grid gap-2 text-sm"><div><dt className="text-fg-muted">Request reference</dt><dd className="break-all font-mono">{result.applicationId ?? application?.id}</dd></div>{application?.submittedAt && <div><dt className="text-fg-muted">Submitted</dt><dd>{new Date(application.submittedAt).toLocaleString("en-ZA")}</dd></div>}</dl>}
      {submitted && !summary.needsReconfirmation && !summary.approved && <p className="text-sm text-fg-muted">Awaiting university review. We will email you when a decision is made.</p>}
      <div ref={feedback} tabIndex={-1} role={result.error ? "alert" : "status"} className="text-sm">{result.error || result.message}</div>
      {result.uncertain ? <button className={accessButton} onClick={() => window.location.reload()}>Reload request status</button> : canSend ? <form action={action} className="space-y-4" aria-label="Submit payment-access request">
        <input type="hidden" name="branchId" value={branch.id} /><input type="hidden" name="payoutReference" value={account?.reference ?? ""} />
        {summary.needsReconfirmation && <input type="hidden" name="reconfirmApplicationId" value={application!.id} />}
        <p className="text-sm">Request access for <strong>{branch.name}</strong> using {account?.bankName || "the saved bank account"} {account?.accountMask}.</p>
        <label className="flex items-start gap-3 text-sm"><input className="mt-1 size-4 shrink-0" type="checkbox" name="acknowledgement" required />{PAYMENT_ACCESS_ACKNOWLEDGEMENT}</label>
        <button className={accessButton} type="submit" disabled={pending}>{pending ? "Submitting…" : summary.needsReconfirmation ? "Confirm updated account" : application?.status === "REJECTED" || application?.status === "REVOKED" ? "Update and resubmit" : "Submit for review"}</button>
      </form> : !submitted && !summary.approved && !account && <p className="text-sm text-fg-muted">Save a payout account to continue.</p>}
    </section>
    {branch.applications.length > 1 && <details className="border-t border-border pt-5"><summary className="cursor-pointer text-sm font-medium">Previous requests</summary><ul className="mt-3 space-y-3">{branch.applications.slice(1).map(app => <li key={app.id} className="text-sm"><p>{app.status.replaceAll("_", " ")} · {app.submittedAt ? new Date(app.submittedAt).toLocaleDateString("en-ZA") : "Earlier request"}</p>{app.reviewNotes && <p className="text-fg-muted">{app.reviewNotes}</p>}</li>)}</ul></details>}
  </div>;
}
