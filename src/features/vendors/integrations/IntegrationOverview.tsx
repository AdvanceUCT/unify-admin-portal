import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import type { integrationOverview } from "@/lib/vendors/integrationOverview";

export function IntegrationOverview({ state }: { state: Awaited<ReturnType<typeof integrationOverview>> }) {
  return <div className="space-y-8"><div className="grid gap-8 lg:grid-cols-2">
    {(["verification", "payments"] as const).map(kind => {
      const flow = state[kind];
      const next = !flow.ready ? { href: kind === "payments" ? "/vendor/applications" : "/vendor/branches", label: "Review setup" } : !flow.key ? { href: `/vendor/integrations/keys?preset=${kind}`, label: "Create API key" } : { href: `/vendor/integrations/guides/${kind}`, label: "Open setup guide" };
      return <section key={kind} className="space-y-4 border-t border-border pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><h2 className="text-section-title text-fg">{kind === "verification" ? "Verify students" : "Accept wallet payments"}</h2><Badge tone={flow.ready && flow.key ? "success" : "warning"}>{flow.ready && flow.key ? "Configured" : "Needs attention"}</Badge></div>
        <p className="text-sm text-fg-muted">{kind === "verification" ? "Check student status for your checkout or access flow." : "Let students scan a sale and approve its fixed amount."}</p>
        <ol aria-label={`${kind} flow`} className="flex flex-wrap gap-2 text-sm text-fg">{(kind === "verification" ? ["Your checkout", "Student verification", "Decision"] : ["Your till", "Student approval", "Paid receipt"]).map((step, i) => <li key={step} className="flex items-center gap-2"><span className="text-brand-600">{i + 1}</span>{step}{i < 2 && <span aria-hidden="true" className="text-fg-subtle">â†’</span>}</li>)}</ol>
        <dl className="divide-y divide-border text-sm"><div className="flex justify-between gap-3 py-2"><dt className="text-fg-muted">Prerequisites</dt><dd>{flow.ready ? "Ready" : "Needs attention"}</dd></div><div className="flex justify-between gap-3 py-2"><dt className="text-fg-muted">API key</dt><dd>{flow.key ? "Configured" : "Required"}</dd></div><div className="flex justify-between gap-3 py-2"><dt className="text-fg-muted">Callback</dt><dd>{flow.callback ? "Configured" : "Optional; poll the API"}</dd></div><div className="py-2"><dt className="text-fg-muted">Delivery evidence across destinations</dt><dd>{flow.lastSuccess ? `Last recorded success: ${new Date(flow.lastSuccess).toLocaleString()}` : "No successful delivery recorded"}</dd></div></dl>
        {kind === "payments" && state.payments.reason && <p className="text-sm text-warning-fg">{state.payments.reason} <Link className="underline" href="/vendor/branches">Review branches</Link> Â· <Link className="underline" href="/vendor/payments">View wallet</Link></p>}
        {kind === "verification" && !flow.ready && <p className="text-sm text-warning-fg">An active default verification branch must be provisioned.</p>}
        <div className="flex flex-wrap gap-4 text-sm"><Link href={next.href} className="font-medium text-brand-600 underline">{next.label}</Link><Link href={`/vendor/integrations/callbacks?type=${kind}`} className="text-brand-600 underline">View callbacks</Link></div>
      </section>;
    })}
  </div><p className="border-t border-border pt-4 text-sm text-fg-muted">Configuration does not prove your checkout works. Follow the guide and check an authoritative result. Payments use the current test payment configuration.</p><div className="flex flex-wrap gap-5 text-sm"><Link href="/vendor/integrations/guides/refunds" className="text-brand-600 underline">Refund and recovery guide</Link><Link href="/vendor/integrations/reference#troubleshooting" className="text-brand-600 underline">Troubleshooting</Link><Link href="/vendor/help" className="text-brand-600 underline">Get help</Link></div></div>;
}
