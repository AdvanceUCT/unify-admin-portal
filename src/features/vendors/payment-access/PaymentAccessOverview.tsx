/**
 * @fileoverview Lists each branch's payment access state for the vendor owner.
 * @module features/vendors/payment-access/PaymentAccessOverview
 */

import { CreditCard, MapPin } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/Badge";
import { paymentAccessSummary, type PaymentAccessData } from "@/lib/payments/paymentAccessSummary";
import { accessBadgeTone, accessButton, accessCard, accessCardHeader, accessSecondaryButton } from "./styles";

export function PaymentAccessOverview({ data }: { data: PaymentAccessData }) {
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-surface p-5 shadow-md">
        <h1 className="text-page-title text-fg">Payment access</h1>
        <p className="mt-1 text-sm text-fg-subtle">Request and track wallet payment approval for each branch.</p>
      </section>

      <section className={accessCard}>
        <div className={accessCardHeader}>
          <div className="flex items-center gap-2">
            <CreditCard aria-hidden className="size-5 text-brand-700" />
            <h2 className="text-section-title text-fg">Branches</h2>
          </div>
          <p className="text-sm text-fg-muted">
            {data.branches.length} branch{data.branches.length === 1 ? "" : "es"}
          </p>
        </div>
        {data.branches.length === 0 ? (
          <div className="flex flex-col items-center gap-4 px-5 py-8 text-center">
            <p className="text-sm text-fg-subtle">Add a branch to request payment access.</p>
            <Link className={accessButton} href="/vendor/branches">Add a branch</Link>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {data.branches.map((branch) => {
              const state = paymentAccessSummary(branch, data.context);
              const notice = state.paused || state.blockers[0];
              return (
                <li className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between" key={branch.id}>
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-fg">{branch.name}</p>
                      <Badge tone={accessBadgeTone(state)}>{state.requestLabel}</Badge>
                      {state.paused ? <Badge tone="warning">Payments paused</Badge> : null}
                    </div>
                    <p className="flex items-center gap-1.5 text-sm text-fg-muted">
                      <MapPin aria-hidden className="size-3.5 shrink-0" />
                      {branch.address || "No location supplied"}
                    </p>
                    {notice ? <p className="text-sm text-warning-fg">{notice}</p> : null}
                  </div>
                  <Link
                    className={state.canSubmit || state.canReconfirm ? accessButton : accessSecondaryButton}
                    href={`/vendor/branches/${branch.id}/payment-access`}
                  >
                    {state.actionLabel}
                    <span className="sr-only"> for {branch.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
