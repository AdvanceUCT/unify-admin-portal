"use client";
import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/Badge";
import { PAYMENT_ACCESS_ACKNOWLEDGEMENT, paymentAccessSummary, type AccessActionResult, type AccessBranch, type AccessContext, type PayoutAccount } from "@/lib/payments/paymentAccessSummary";
import { AccountSummary, accessButton, accessInput } from "./PayoutAccountEditor";
type ReviewAction = (state: AccessActionResult, data: FormData) => Promise<AccessActionResult>;
export type AccountHistoryEntry = { id: string; applicationId: string | null; at: string; previous: PayoutAccount | null; next: PayoutAccount | null };
export function PaymentAccessReview({ companyName, branch, context, history, approve, reject }: { companyName: string; branch: AccessBranch; context: AccessContext; history: AccountHistoryEntry[]; approve: ReviewAction; reject: ReviewAction }) {
  const summary = paymentAccessSummary(branch, context);
  const feedback = useRef<HTMLDivElement>(null);
  const [result, action, pending] = useActionState(async (state: AccessActionResult, form: FormData) => {
    try { return await (form.get("decision") === "approve" ? approve : reject)(state, form); }
    catch { return { uncertain: true, error: "The decision could not be confirmed. Reload the request." }; }
  }, {});
  useEffect(() => { if (result.error || result.message) feedback.current?.focus(); }, [result]);
  const application = summary.application;
  return <div className="mx-auto max-w-4xl space-y-6"><Link className="text-sm underline" href="/vendors?tab=payments">Back to payment access</Link>
    <header className="flex flex-wrap justify-between gap-4"><div><h1 className="text-page-title">{companyName}</h1><p className="text-fg-muted">{branch.name} · {branch.address || "No location supplied"}</p></div><Badge tone={summary.approved ? "success" : "warning"}>{summary.requestLabel}</Badge></header>
    {summary.blockers.map(text => <p className="text-sm text-warning-fg" key={text}>{text}</p>)}
    {context.paymentStatus === "SUSPENDED" && <div className="border-l-2 border-warning-border bg-warning-bg p-4 text-sm"><p className="font-semibold">Vendor payments are suspended</p><p>{context.suspensionReason || "Existing vendor restrictions remain in effect."}</p><p className="mt-2">Approving this branch will not restore vendor payments.</p></div>}
    <section className="space-y-4 border-t border-border pt-5"><h2 className="text-section-title">Submitted payout account</h2><AccountSummary account={application?.payoutAccount ?? null} />
      {summary.needsReconfirmation && <div className="space-y-3 border-l-2 border-warning-border bg-warning-bg p-4 text-sm"><p className="font-semibold">Owner confirmation required</p><p>The account changed or the original request is incomplete. Approval is blocked until the owner confirms.</p><p className="font-medium">Current payout account</p><AccountSummary account={context.payoutAccount} /></div>}
      <p className="text-xs text-fg-muted">Payout accounts are shared across this vendor's branches.</p>
    </section>
    <section className="space-y-3 border-t border-border pt-5"><h2 className="text-section-title">Request details</h2><p className="break-all font-mono text-sm">{application?.id || "No submitted request"}</p><p className="text-sm text-fg-muted">{application?.submittedAt ? `Submitted ${new Date(application.submittedAt).toLocaleString("en-ZA")}` : "Not submitted"}</p><p className="text-sm">{application?.acknowledged ? "Acknowledgement accepted" : "Acknowledgement missing"}</p><details><summary className="cursor-pointer text-sm underline">Student data acknowledgement</summary><p className="mt-2 text-sm text-fg-muted">{PAYMENT_ACCESS_ACKNOWLEDGEMENT}</p></details></section>
    <div ref={feedback} tabIndex={-1} role={result.error ? "alert" : "status"} className="text-sm">{result.error || result.message}</div>
    {result.uncertain ? <button className={accessButton} onClick={() => window.location.reload()}>Reload current decision</button> : application?.status === "PENDING" && !result.ok && <section className="space-y-4 border-t border-border pt-5"><h2 className="text-section-title">Review decision</h2>
      <form action={action}><input type="hidden" name="applicationId" value={application.id} /><input type="hidden" name="decision" value="approve" /><input type="hidden" name="payoutReference" value={context.payoutAccount?.reference ?? ""} /><button className={accessButton} disabled={pending || !summary.canApprove}>{pending ? "Saving decision…" : "Approve branch"}</button></form>
      <details><summary className="min-h-11 cursor-pointer text-sm font-medium text-danger-fg">Reject request</summary><form action={action} className="mt-3 max-w-xl space-y-3"><input type="hidden" name="applicationId" value={application.id} /><input type="hidden" name="decision" value="reject" /><label className="grid gap-2 text-sm font-medium">Reason shown to vendor<textarea className={`${accessInput} min-h-24 py-2`} name="notes" required maxLength={500} /></label><button className={accessButton} disabled={pending}>{pending ? "Saving decision…" : "Confirm rejection"}</button></form></details>
    </section>}
    <section className="space-y-4 border-t border-border pt-5"><h2 className="text-section-title">Request history</h2>{branch.applications.length ? <ul className="divide-y divide-border">{branch.applications.map(app => <li key={app.id} className="space-y-1 py-3 text-sm"><p className="font-medium">{app.status.replaceAll("_", " ")}</p><p className="break-all font-mono text-xs text-fg-muted">{app.id}</p>{app.reviewedAt && <p>{new Date(app.reviewedAt).toLocaleString("en-ZA")}</p>}{(app.reviewNotes || app.revokedNotes) && <p className="whitespace-pre-wrap text-fg-muted">{app.reviewNotes || app.revokedNotes}</p>}</li>)}</ul> : <p className="text-sm text-fg-muted">No requests yet.</p>}
      {history.map(entry => <details key={entry.id}><summary className="cursor-pointer text-sm">Account reconfirmed {new Date(entry.at).toLocaleString("en-ZA")}</summary><div className="mt-3 space-y-3 text-sm"><p>Previous submission</p><AccountSummary account={entry.previous} /><p>Reconfirmed account</p><AccountSummary account={entry.next} /></div></details>)}
    </section>
  </div>;
}
