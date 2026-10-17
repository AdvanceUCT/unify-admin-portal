import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { paymentAccessSummary, type PaymentAccessData } from "@/lib/payments/paymentAccessSummary";
export function PaymentAccessOverview({ data }: { data: PaymentAccessData }) {
  return <div className="space-y-6"><header><h1 className="text-page-title">Payment access</h1><p className="mt-1 text-sm text-fg-muted">Request and track approval for each branch.</p></header>
    {!data.branches.length ? <div className="space-y-3 border-t border-border pt-5"><p>Add a branch to request payment access.</p><Link href="/vendor/branches" className="text-sm font-medium underline">Add a branch</Link></div> : <ul className="divide-y divide-border border-y border-border">{data.branches.map(branch => {
      const state = paymentAccessSummary(branch, data.context);
      return <li key={branch.id} className="flex flex-col justify-between gap-4 py-5 sm:flex-row sm:items-center"><div className="space-y-2"><div className="flex flex-wrap items-center gap-3"><h2 className="font-semibold">{branch.name}</h2><Badge tone={state.approved ? "success" : "neutral"}>{state.requestLabel}</Badge>{state.paused && <Badge tone="warning">Payments paused</Badge>}</div><p className="text-sm text-fg-muted">{state.paused || state.blockers[0] || branch.address || "No location supplied"}</p></div><Link className="inline-flex min-h-11 shrink-0 items-center text-sm font-medium text-brand-700 underline" href={`/vendor/branches/${branch.id}/payment-access`}>{state.actionLabel}<span className="sr-only"> for {branch.name}</span></Link></li>;
    })}</ul>}
  </div>;
}
