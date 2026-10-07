"use client";
import { useState } from "react";
import Link from "next/link";
import { endpoints, exampleRequest, scopeLabels, troubleshooting, type EndpointExample, type IntegrationBranch } from "@/lib/vendors/integrationGuide";
import { CodeBlock, CopyButton, input } from "./IntegrationUi";

export type GuideKind = "verification" | "payments" | "refunds";
const steps: Record<GuideKind, { title: string; text: string; examples: string[] }[]> = {
  verification: [
    { title: "Prepare your server", text: "Create a student verification key. Check that your default verification branch is active and provisioned. A restricted key must include that branch. Keep the key in a server environment variable.", examples: [] },
    { title: "Start verification", text: "Save your stable checkoutId, then create the session from your backend. Keep that reference if the response is lost.", examples: ["verification-create"] },
    { title: "Let the student verify", text: "Open the returned verificationUrl from your customer-facing checkout. The student reviews and explicitly agrees to disclose requested details. Keep the checkout pending until an authoritative decision arrives.", examples: [] },
    { title: "Read the decision", text: "Read the result from your backend. APPROVED permits the action that needs verification. Handle DECLINED, EXPIRED and FAILED visibly. A callback can prompt this read, but polling is your fallback.", examples: ["verification-read"] },
  ],
  payments: [
    { title: "Prepare your till server", text: "Use the current test payment configuration. The vendor payment application and branch must be approved and active. Create a wallet payment key for the branch. Credential verification is separate from payment.", examples: [] },
    { title: "Create a fixed sale", text: "Persist the original orderReference, amount, branch and idempotencyKey before sending. Amounts are integer cents: 3500 = R35.00. A request expires after ten minutes; retrying creation preserves its original expiry.", examples: ["payment-create"] },
    { title: "Display the payment QR", text: "Encode the returned qrPayload as a QR in your till. The student scans it, reviews the server-stored amount and explicitly approves payment in their wallet. Do not substitute the verification URL or static branch payment QR.", examples: [] },
    { title: "Confirm payment", text: "Poll or use a signed callback to trigger an authoritative read. Only PAID confirms the sale and gives receipt identifiers. A missing callback or browser redirect is not payment confirmation.", examples: ["payment-read", "payment-list"] },
    { title: "Handle an abandoned sale", text: "Cancel an unpaid request explicitly. If payment has already won the race, use its paid receipt. Recover the original sale before creating another.", examples: ["payment-cancel"] },
  ],
  refunds: [
    { title: "Keep the original instruction", text: "Add refunds:create to a key with access to the original sale's branch. Persist the request ID, amount and refund key before registration. Block new refunds for this operator while an instruction is unresolved; do not replace it when the amount or screen changes.", examples: [] },
    { title: "Register without moving money", text: "Register frozen terms. Registration acknowledgment returns the operation ID. If acknowledgment is lost, replay identical registration. A key reused with different terms is an idempotency conflict.", examples: ["refund-register"] },
    { title: "Recover before submitting", text: "Hydrate this operator's pending operation across browsers before enabling another refund. Discovery never executes it. A different API credential is a different operator; never reassign an unresolved instruction after credential changes.", examples: ["refund-pending", "refund-read"] },
    { title: "Execute explicitly", text: "After registration acknowledgment, explicitly execute the stored operation. Inspect its status even when HTTP is successful. COMPLETED, REJECTED and CANCELLED are stable terminal outcomes. Refresh the sale's refund totals after completion.", examples: ["refund-execute"] },
    { title: "Check or cancel an unknown result", text: "Timeouts, 401/403, 5xx, missing records and malformed responses do not establish rejection. Retain the reference and check again with the original authorized operator. Recovery works through payment suspension and inactive acceptance; identity and branch authorization still apply. Cancellation can return COMPLETED if execution already succeeded.", examples: ["refund-cancel"] },
  ],
};

function Example({ endpoint, baseUrl, branchId, language }: { endpoint: EndpointExample; baseUrl: string; branchId: string; language: "curl" | "node" }) {
  return <article id={endpoint.id} className="min-w-0 scroll-mt-8 space-y-3 border-t border-border pt-4">
    <h3 className="font-medium text-fg">{endpoint.title}</h3><p className="break-all font-mono text-xs text-brand-600">{endpoint.method} /api/vendor/v1{endpoint.path}</p><p className="text-sm text-fg-muted">{endpoint.description}</p>
    <p className="text-sm">Permission: {scopeLabels[endpoint.scope]} <code className="text-xs text-fg-muted">{endpoint.scope}</code></p>
    <p className="text-sm text-fg-muted">{endpoint.fields}</p>
    <CodeBlock code={exampleRequest(endpoint, baseUrl, branchId, language)} label={`${endpoint.title} ${language === "curl" ? "cURL" : "Node.js"} request`} />
    <details className="text-sm"><summary className="cursor-pointer text-fg-muted">Synthetic response example</summary><div className="mt-3"><CodeBlock code={JSON.stringify(endpoint.response, null, 2)} label={`${endpoint.title} example response`} /></div></details>
    <p className="text-sm text-fg-muted">{endpoint.recovery}</p>
  </article>;
}

export function IntegrationDocs({ baseUrl, branches, guide }: { baseUrl: string; branches: IntegrationBranch[]; guide?: GuideKind }) {
  const [language, setLanguage] = useState<"curl" | "node">("curl");
  const [branchId, setBranchId] = useState(branches.find(b => b.active && b.status === "ACTIVE" && b.paymentStatus === "ACTIVE")?.id ?? "");
  const [search, setSearch] = useState("");
  const filtered = endpoints.filter(e => `${e.title} ${e.path} ${e.description} ${e.scope} ${e.group} ${e.fields}`.toLowerCase().includes(search.toLowerCase().trim()));
  return <div className="min-w-0 space-y-6">
    <header className="space-y-2"><h2 className="text-section-title">{guide ? `${guide === "verification" ? "Student verification" : guide === "payments" ? "Wallet payments" : "Refund and recovery"} guide` : "API reference"}</h2><p className="text-sm text-fg-muted">Examples run on your server. Set UNIFY_VENDOR_API_KEY there; never put it in browser code or a QR.</p></header>
    <div className="grid gap-4 border-y border-border py-4 sm:grid-cols-2"><label className="block text-sm">Example language<select className={input} value={language} onChange={e => setLanguage(e.target.value as "curl" | "node")}><option value="curl">cURL · Bash / POSIX shell</option><option value="node">Node.js · server-side fetch</option></select></label><label className="block text-sm">Payment branch<select className={input} value={branchId} onChange={e => setBranchId(e.target.value)}><option value="">Select a branch</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name} · {b.active && b.status === "ACTIVE" && b.paymentStatus === "ACTIVE" ? "Accepts payments" : "Not accepting payments"}</option>)}</select></label><div className="min-w-0 text-sm sm:col-span-2"><span className="text-fg-muted">Portal base URL </span><code className="break-all">{baseUrl}</code><span className="ml-3"><CopyButton value={baseUrl} label="Copy base URL" /></span>{branchId && <p className="mt-2 break-all text-xs text-fg-muted">Selected branch ID: {branchId}</p>}</div></div>
    {guide ? <>
      <div className="flex flex-wrap gap-4 text-sm"><Link className="text-brand-600 underline" href={`/vendor/integrations/keys?preset=${guide === "verification" ? "verification" : "payments"}`}>Create the required key</Link><Link className="text-brand-600 underline" href="/vendor/branches">Review branches</Link><Link className="text-brand-600 underline" href="/vendor/applications">Payment applications</Link></div>
      <ol className="space-y-8">{steps[guide].map((step, index) => <li key={step.title} id={`step-${index + 1}`} className="scroll-mt-8"><div className="mb-3 flex gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-medium text-brand-700">{index + 1}</span><div><h3 className="font-medium text-fg">{step.title}</h3><p className="mt-1 max-w-3xl text-sm leading-relaxed text-fg-muted">{step.text}</p></div></div><div className="min-w-0 space-y-6">{step.examples.map(id => <Example key={id} endpoint={endpoints.find(e => e.id === id)!} baseUrl={baseUrl} branchId={branchId} language={language} />)}</div></li>)}</ol>
      <div className="flex flex-wrap gap-4 border-t border-border pt-4 text-sm"><Link className="text-brand-600 underline" href={`/vendor/integrations/callbacks?type=${guide === "verification" ? "verification" : "payments"}`}>Configure callbacks and verify signatures</Link>{guide === "payments" && <Link className="text-brand-600 underline" href="/vendor/integrations/guides/refunds">Next: refunds and recovery</Link>}<Link className="text-brand-600 underline" href="/vendor/integrations/reference#troubleshooting">Troubleshooting</Link></div>
    </> : <>
      <label className="block text-sm">Search API endpoints<input type="search" className={input} value={search} onChange={e => setSearch(e.target.value)} placeholder="Refunds, permissions, receipt…" /></label>
      <nav aria-label="API endpoint groups" className="flex flex-wrap gap-4 text-sm">{["verification", "payments", "refunds"].map(group => <a key={group} href={`#${group}`} className="text-brand-600 underline">{group === "verification" ? "Verification" : group === "payments" ? "Payments" : "Refunds"}</a>)}<a href="#troubleshooting" className="text-brand-600 underline">Troubleshooting</a></nav>
      {!filtered.length && <p role="status" className="text-sm text-fg-muted">No endpoints match. Try a path, permission or action.</p>}
      {(["verification", "payments", "refunds"] as const).map(group => <section key={group} id={group} className="scroll-mt-8 space-y-6"><h2 className="text-section-title capitalize">{group}</h2>{filtered.filter(e => e.group === group).map(endpoint => <Example key={endpoint.id} endpoint={endpoint} baseUrl={baseUrl} branchId={branchId} language={language} />)}</section>)}
      <section id="troubleshooting" className="scroll-mt-8 space-y-3 border-t border-border pt-5"><h2 className="text-section-title">Troubleshooting</h2>{troubleshooting.map(([code, advice]) => <details className="border-b border-border py-3 text-sm" key={code}><summary className="cursor-pointer font-medium text-fg">{code}</summary><p className="mt-2 text-fg-muted">{advice}</p></details>)}<Link href="/vendor/help" className="inline-block text-sm text-brand-600 underline">Contact support</Link></section>
    </>}
  </div>;
}
