/**
 * @fileoverview Renders the authenticated administrator page at `/vendors/payment-access/[partnershipId]`.
 * @module app/(admin)/vendors/payment-access/[partnershipId]/page
 */

import { notFound } from "next/navigation";
import { Landmark } from "lucide-react";

import { BackButton } from "@/components/ui/BackButton";
import { requireRole } from "@/lib/auth/session";
import { getVendorPartnershipById } from "@/lib/payments/partnerships";
import {
  approveVendorPaymentApplicationAction,
  rejectVendorPaymentApplicationAction,
  revokeVendorPaymentApplicationAction,
  setCampusStatusAction,
} from "../../actions";
import { PendingApplicationReview } from "./PendingApplicationReview";
import { RevokePaymentAccessButton } from "./RevokePaymentAccessButton";

function decisionDate(value: Date | null) {
  if (!value) return null;
  return value.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default async function VendorPaymentAccessDetailPage({
  params,
}: {
  params: Promise<{ partnershipId: string }>;
}) {
  await requireRole(["SUPER_ADMIN", "ADMIN"]);
  const { partnershipId } = await params;
  const partnership = await getVendorPartnershipById(partnershipId);

  if (!partnership) {
    notFound();
  }

  const application = partnership.paymentApplications[0] ?? null;

  return (
    <div className="space-y-6">
      <BackButton href="/vendors?tab=payments" label="Back to Payment Access" />

      <div>
        <h1 className="text-page-title text-fg">{partnership.vendorProfile.companyName}</h1>
        <p className="mt-1 text-sm text-fg-subtle">{partnership.vendorProfile.serviceCategory}</p>
      </div>

      {/* Campus status */}
      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-section-title text-fg">Campus status</h2>
          <p className="mt-1 text-sm text-fg-subtle">
            Payment access can only be approved for on-campus vendors.
          </p>
        </div>
        <div className="p-5">
          <form action={setCampusStatusAction} className="flex items-center gap-2">
            <input type="hidden" name="partnershipId" value={partnership.id} />
            <select
              className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              defaultValue={partnership.campusStatus ?? ""}
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
              className="h-10 rounded-md border border-border bg-surface px-4 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg"
              type="submit"
            >
              Save
            </button>
          </form>
        </div>
      </section>

      {/* Payment acceptance */}
      {partnership.paymentAcceptanceStatus === "PENDING" && application ? (
        <PendingApplicationReview
          applicationId={application.id}
          approveAction={approveVendorPaymentApplicationAction}
          companyName={partnership.vendorProfile.companyName}
          justification={application.justification}
          rejectAction={rejectVendorPaymentApplicationAction}
        />
      ) : (
        <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-section-title text-fg">Payment acceptance</h2>
          </div>
          <div className="space-y-4 p-5">
            {partnership.paymentAcceptanceStatus === "APPROVED" && application ? (
              <>
                <p className="text-sm text-fg-muted">
                  {partnership.vendorProfile.companyName} is approved to accept UNIFY wallet
                  payments on campus
                  {decisionDate(application.reviewedAt) ? ` since ${decisionDate(application.reviewedAt)}` : ""}.
                </p>
                <RevokePaymentAccessButton
                  action={revokeVendorPaymentApplicationAction}
                  applicationId={application.id}
                  companyName={partnership.vendorProfile.companyName}
                />
              </>
            ) : partnership.paymentAcceptanceStatus === "REJECTED" && application ? (
              <p className="text-sm text-fg-muted">
                This request was rejected
                {decisionDate(application.reviewedAt) ? ` on ${decisionDate(application.reviewedAt)}` : ""}
                {application.reviewNotes ? `: ${application.reviewNotes}` : "."}
              </p>
            ) : partnership.paymentAcceptanceStatus === "REVOKED" && application ? (
              <p className="text-sm text-fg-muted">
                Payment acceptance was revoked
                {decisionDate(application.revokedAt) ? ` on ${decisionDate(application.revokedAt)}` : ""}
                {application.revokedNotes ? `: ${application.revokedNotes}` : "."}
              </p>
            ) : (
              <p className="text-sm text-fg-subtle">
                This vendor hasn&apos;t requested payment acceptance yet.
              </p>
            )}
          </div>
        </section>
      )}

      {/* Bank / payment setup details — filled in by a future branch */}
      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <Landmark className="size-4.5 text-fg-subtle" aria-hidden="true" />
          <h2 className="text-section-title text-fg">Bank details</h2>
        </div>
        <div className="p-5">
          <p className="text-sm text-fg-subtle">Not yet submitted.</p>
        </div>
      </section>
    </div>
  );
}
