/**
 * @fileoverview Renders the approved vendor page at `/vendor/payments`.
 * @module app/vendor/(portal)/payments/page
 */

import { Badge } from "@/components/ui/Badge";
import { getPartnershipForVendor } from "@/lib/payments/partnerships";
import { requireVendorOwnerContext } from "@/lib/vendors/context";

import { PaymentApplicationForm } from "./PaymentApplicationForm";

const STATUS_BADGE = {
  PENDING: { tone: "warning" as const, label: "Pending review" },
  APPROVED: { tone: "success" as const, label: "Approved" },
  REJECTED: { tone: "danger" as const, label: "Rejected" },
  REVOKED: { tone: "danger" as const, label: "Revoked" },
};

export default async function VendorPaymentsPage() {
  const { context } = await requireVendorOwnerContext();

  if (context.campusStatus !== "ON_CAMPUS") {
    return (
      <div className="space-y-6">
        <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-section-title text-fg">Payment acceptance</h2>
          </div>
          <div className="p-5">
            <p className="text-sm text-fg-muted">
              Payment acceptance is currently available to on-campus vendors only.
            </p>
            <p className="mt-2 text-sm text-fg-subtle">
              {context.campusStatus === "OFF_CAMPUS"
                ? "Your business is classified as off-campus, so this isn't available right now."
                : "Your campus status hasn't been classified yet."}{" "}
              If this doesn&apos;t match your situation, contact your university administrator to
              have it corrected.
            </p>
          </div>
        </section>
      </div>
    );
  }

  const partnership = await getPartnershipForVendor(context.vendorProfileId);
  const application = partnership?.paymentApplications[0] ?? null;
  const canApply = !application || application.status === "REJECTED" || application.status === "REVOKED";

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-section-title text-fg">Payment acceptance</h2>
          <p className="mt-1 text-sm text-fg-subtle">
            Apply to accept UNIFY wallet payments from students on campus. Funds settle directly to
            the university&apos;s own Paystack-linked account &mdash; no setup is required on your side.
          </p>
        </div>

        <div className="p-5">
          {!partnership ? (
            <p className="text-sm text-fg-subtle">
              Your university partnership isn&apos;t set up yet. Contact your university administrator.
            </p>
          ) : application ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-fg-muted">Status:</span>
                <Badge tone={STATUS_BADGE[application.status as keyof typeof STATUS_BADGE]?.tone ?? "neutral"}>
                  {STATUS_BADGE[application.status as keyof typeof STATUS_BADGE]?.label ?? application.status}
                </Badge>
              </div>
              {application.reviewNotes ? (
                <p className="text-sm text-fg-muted">Note from the university: {application.reviewNotes}</p>
              ) : null}
              {application.status === "PENDING" ? (
                <p className="text-sm text-fg-subtle">
                  Your university administrator is reviewing this request.
                </p>
              ) : null}
              {application.status === "APPROVED" ? (
                <p className="text-sm text-fg-subtle">
                  You&apos;re approved to accept UNIFY wallet payments on campus.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-fg-subtle">You haven&apos;t applied for payment acceptance yet.</p>
          )}

          {partnership && canApply ? (
            <div className={application ? "mt-5 border-t border-border pt-5" : ""}>
              <PaymentApplicationForm />
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
