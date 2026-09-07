/**
 * @fileoverview Renders the authenticated administrator page at `/payments`.
 * @module app/(admin)/payments/page
 */

import Link from "next/link";
import { Building2, Wallet } from "lucide-react";

import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { requireRole } from "@/lib/auth/session";
import { listVendorPartnerships } from "@/lib/payments/partnerships";
import { getUniversityProfile } from "@/lib/university/profile";
import { setCampusStatusAction } from "./actions";

const PAYMENT_ACCEPTANCE_BADGE: Record<string, { tone: "success" | "warning" | "danger"; label: string }> = {
  PENDING: { tone: "warning", label: "Pending review" },
  APPROVED: { tone: "success", label: "Accepts payments" },
  REJECTED: { tone: "danger", label: "Rejected" },
  REVOKED: { tone: "danger", label: "Revoked" },
};

export default async function PaymentsPage() {
  await requireRole(["SUPER_ADMIN", "ADMIN"]);

  const [profile, partnerships] = await Promise.all([
    getUniversityProfile(),
    listVendorPartnerships(),
  ]);

  return (
    <div className="space-y-6">
      {!profile?.paymentServicesEnabled && (
        <section className="flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50 p-4">
          <Wallet className="mt-0.5 shrink-0 text-brand-700" size={20} aria-hidden="true" />
          <div>
            <p className="font-medium text-brand-700">Payment services are not enabled yet</p>
            <p className="mt-1 text-sm text-brand-700">
              Set up finance/technical contacts and a validated Paystack key, then enable payment
              services from{" "}
              <Link className="underline hover:no-underline" href="/settings">
                Settings
              </Link>
              .
            </p>
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <Building2 className="size-4.5 text-fg-subtle" aria-hidden="true" />
          <h2 className="text-section-title text-fg">Vendor partnerships</h2>
        </div>
        <div className="divide-y divide-border">
          {partnerships.map((partnership) => {
            const acceptance = partnership.paymentAcceptanceStatus
              ? PAYMENT_ACCEPTANCE_BADGE[partnership.paymentAcceptanceStatus]
              : null;

            return (
              <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between" key={partnership.id}>
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={partnership.vendorProfile.companyName} size="md" />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-fg">{partnership.vendorProfile.companyName}</p>
                    <p className="truncate text-sm text-fg-subtle">{partnership.vendorProfile.serviceCategory}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {acceptance && <Badge tone={acceptance.tone}>{acceptance.label}</Badge>}
                  {partnership.campusStatus ? (
                    <Badge tone={partnership.campusStatus === "ON_CAMPUS" ? "success" : "version"}>
                      {partnership.campusStatus === "ON_CAMPUS" ? "On campus" : "Off campus"}
                    </Badge>
                  ) : (
                    <form action={setCampusStatusAction} className="flex items-center gap-2">
                      <input type="hidden" name="partnershipId" value={partnership.id} />
                      <select
                        className="h-9 rounded-md border border-border bg-surface px-2 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                        defaultValue=""
                        name="campusStatus"
                        required
                      >
                        <option disabled value="">
                          Classify campus status
                        </option>
                        <option value="ON_CAMPUS">On campus</option>
                        <option value="OFF_CAMPUS">Off campus</option>
                      </select>
                      <button
                        className="h-9 rounded-md border border-border bg-surface px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg"
                        type="submit"
                      >
                        Save
                      </button>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
          {partnerships.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-fg-subtle">
              No vendor partnerships yet.
            </p>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-section-title text-fg">Transactions &amp; payouts</h2>
        </div>
        <p className="px-5 py-8 text-center text-sm text-fg-subtle">
          Wallet transaction and payout reporting will appear here once payment services are live.
        </p>
      </section>
    </div>
  );
}
