"use client";
import { useState } from "react";
import Link from "next/link";
import { endpoints, exampleRequest, integrationSteps, scopeLabels, type IntegrationBranch, type EndpointExample } from "@/lib/vendors/integrationGuide";
import { CodeBlock, CopyButton, input, primary } from "./IntegrationUi";
function Example({ endpoint, baseUrl, branchId, language, secondary = false }: { endpoint: EndpointExample; baseUrl: string; branchId: string; language: "curl" | "node"; secondary?: boolean }) {
  return <article id={endpoint.id} className="min-w-0 scroll-mt-44 space-y-3" aria-label={endpoint.title}>
    {secondary && <h4 className="font-semibold">{endpoint.title}</h4>}
    <p className="break-all font-mono text-sm text-brand-700">{endpoint.method} /api/vendor/v1{endpoint.path}</p>
    <CodeBlock code={exampleRequest(endpoint, baseUrl, branchId, language)} label={`${endpoint.title} ${language === "curl" ? "cURL" : "Node.js"} request`} />
    <details className="space-y-3"><summary className="cursor-pointer font-medium text-brand-700">Request details and response</summary><p className="mt-3 text-fg-muted">{endpoint.description}</p><p>Permission: {scopeLabels[endpoint.scope]} <code className="text-sm">{endpoint.scope}</code></p><p className="text-fg-muted">{endpoint.fields}</p><CodeBlock code={JSON.stringify(endpoint.response, null, 2)} label={`${endpoint.title} synthetic response`} /><p className="text-fg-muted">{endpoint.recovery}</p></details>
  </article>;
}
export function WorkflowGuide({ kind, baseUrl, branches, ready, hasKey, reason }: { kind: "verification" | "payments"; baseUrl: string; branches: IntegrationBranch[]; ready: boolean; hasKey: boolean; reason?: string | null }) {
  const [language, setLanguage] = useState<"curl" | "node">("curl");
  const [branchId, setBranchId] = useState(branches.find(branch => branch.active && branch.status === "ACTIVE" && branch.paymentStatus === "ACTIVE")?.id ?? "");
  function steps(group: "verification" | "payments" | "refunds") {
    return <ol className="space-y-8">{integrationSteps[group].map((step, index) => <li id={`${group === "refunds" ? "refund-" : ""}step-${index + 1}`} key={step.title} className="scroll-mt-44 space-y-4"><div className="flex items-start gap-3"><span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-50 font-semibold text-brand-700">{index + 1}</span><div className="min-w-0"><h3 className="text-lg font-semibold">{step.title}</h3><p className="mt-1 text-fg-muted">{step.text}</p></div></div>
      {index === 0 && group !== "refunds" && <div className="flex flex-wrap gap-3"><Link className={primary} href={`/vendor/integrations/keys?preset=${kind}&returnTo=${kind}`}>Create {kind === "payments" ? "payment" : "verification"} key</Link>{!ready && <Link className="content-center font-medium text-brand-700 underline" href={kind === "payments" ? "/vendor/payments/access" : "/vendor/branches"}>Review {kind === "payments" ? "payment access" : "verification branch"}</Link>}</div>}
      {step.examples.map(id => <Example key={id} endpoint={endpoints.find(endpoint => endpoint.id === id)!} baseUrl={baseUrl} branchId={branchId} language={language} secondary={step.examples.length > 1} />)}
    </li>)}</ol>;
  }
  return <>
    <section id="setup" className="min-w-0 scroll-mt-44 space-y-6" aria-labelledby="setup-title"><header><h2 id="setup-title" className="text-2xl font-semibold">{kind === "verification" ? "Verify student status" : "Accept wallet payments"}</h2><p className="mt-2 text-fg-muted">{ready ? "Branch ready" : reason || "Your verification branch needs attention."} · {hasKey ? "A suitable API key exists" : "Create an API key to begin"}</p></header>
      <div className="grid gap-4 sm:grid-cols-2"><label className="block font-medium">Example language<select aria-label="Example language" className={input} value={language} onChange={event => setLanguage(event.target.value as typeof language)}><option value="curl">cURL · Bash / POSIX</option><option value="node">Node.js · server-side</option></select></label>{kind === "payments" && <label className="block font-medium">Payment branch<select aria-label="Payment branch" className={input} value={branchId} onChange={event => setBranchId(event.target.value)}><option value="">Select a branch</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name} · {branch.active && branch.status === "ACTIVE" && branch.paymentStatus === "ACTIVE" ? "Accepts payments" : "Not accepting payments"}</option>)}</select></label>}</div>
      {kind === "payments" && branchId && <div className="flex min-w-0 flex-wrap items-center gap-3 text-sm"><code className="break-all">{branchId}</code><CopyButton value={branchId} label="Copy selected branch ID" /></div>}
      {steps(kind)}
      <details className="border-t border-border pt-4"><summary className="cursor-pointer font-medium">Your integration test checklist</summary><p className="mt-3 text-fg-muted">These are checks for your team, not recorded test results.</p><ul className="mt-3 list-disc space-y-2 pl-5"><li>Confirm authoritative results on your server.</li><li>Handle pending, failed and interrupted requests.</li><li>If using webhooks, validate signatures and repeated events.</li></ul></details>
    </section>
    {kind === "payments" && <section id="refunds" className="min-w-0 scroll-mt-44 space-y-6 border-t border-border pt-7"><h2 className="text-2xl font-semibold">Refunds and recovery</h2>{steps("refunds")}<details className="space-y-3"><summary className="cursor-pointer font-medium">Compatibility: older refund POST</summary><div className="mt-4"><Example endpoint={endpoints.find(endpoint => endpoint.id === "refund-compatibility")!} baseUrl={baseUrl} branchId={branchId} language={language} /></div></details></section>}
  </>;
}
