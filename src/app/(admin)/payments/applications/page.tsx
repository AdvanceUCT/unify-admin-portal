/**
 * @fileoverview Renders the authenticated administrator page at `/payments/applications`.
 * @module app/(admin)/payments/applications/page
 */

import { Check, Mail } from "lucide-react";

import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { PageTabs } from "@/components/layout/PageTabs";
import { requireRole } from "@/lib/auth/session";
import { listVendorPaymentApplications } from "@/lib/payments/partnerships";
import {
  approveVendorPaymentApplicationAction,
  rejectVendorPaymentApplicationAction,
  revokeVendorPaymentApplicationAction,
} from "../actions";
import { RejectPaymentForm } from "../RejectPaymentForm";
import { RevokePaymentButton } from "../RevokePaymentButton";

function decisionDate(value: Date | string) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function PaymentApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireRole(["SUPER_ADMIN", "ADMIN"]);

  const { tab } = await searchParams;
  const activeTab = tab === "approved" ? "approved" : tab === "rejected" ? "rejected" : "pending";

  const [pendingApplications, approvedApplications, rejectedApplications] = await Promise.all([
    listVendorPaymentApplications({ status: "PENDING" }),
    listVendorPaymentApplications({ status: "APPROVED" }),
    listVendorPaymentApplications({ status: "REJECTED" }),
  ]);

  return (
    <div className="space-y-6">
      <PageTabs
        tabs={[
          {
            count: pendingApplications.length,
            href: "/payments/applications",
            isActive: activeTab === "pending",
            label: "Pending",
          },
          {
            count: approvedApplications.length,
            href: "/payments/applications?tab=approved",
            isActive: activeTab === "approved",
            label: "Approved",
          },
          {
            href: "/payments/applications?tab=rejected",
            isActive: activeTab === "rejected",
            label: "Rejected",
          },
        ]}
      />

      {activeTab === "pending" && (
        <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
          <div className="divide-y divide-border">
            {pendingApplications.map((application) => (
              <div key={application.id} className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex min-w-0 flex-1 gap-4">
                    <Avatar className="mt-0.5" name={application.partnership.vendorProfile.companyName} size="lg" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-section-title text-fg">
                          {application.partnership.vendorProfile.companyName}
                        </h3>
                        <Badge tone="warning">Pending</Badge>
                      </div>
                      <p className="mt-0.5 text-sm text-fg-subtle">
                        {application.partnership.vendorProfile.serviceCategory}
                      </p>
                      <div className="mt-3 flex items-center gap-1.5 text-sm text-fg-muted">
                        <Mail className="size-3.5 shrink-0 text-fg-subtle" />
                        {application.partnership.vendorProfile.contactEmail}
                      </div>
                      {application.justification && (
                        <p className="mt-3 text-sm text-fg-muted">{application.justification}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-start gap-3 lg:items-end">
                    <p className="text-xs text-fg-subtle">Submitted {decisionDate(application.createdAt)}</p>
                    <div className="flex flex-col items-stretch gap-2">
                      <form action={approveVendorPaymentApplicationAction}>
                        <input type="hidden" name="applicationId" value={application.id} />
                        <button
                          className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-success-border bg-success-bg px-3 text-sm font-medium text-success-fg transition hover:bg-success-border"
                          type="submit"
                        >
                          <Check aria-hidden className="size-4" />
                          Approve
                        </button>
                      </form>
                      <RejectPaymentForm action={rejectVendorPaymentApplicationAction} applicationId={application.id} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {pendingApplications.length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-fg-subtle">
                No pending payment-acceptance requests.
              </p>
            )}
          </div>
        </section>
      )}

      {activeTab === "approved" && (
        <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
          <div className="divide-y divide-border">
            {approvedApplications.map((application) => (
              <div key={application.id} className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex min-w-0 flex-1 gap-4">
                    <Avatar className="mt-0.5" name={application.partnership.vendorProfile.companyName} size="lg" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-section-title text-fg">
                          {application.partnership.vendorProfile.companyName}
                        </h3>
                        <Badge tone="success">Approved</Badge>
                      </div>
                      <p className="mt-0.5 text-sm text-fg-subtle">
                        {application.partnership.vendorProfile.serviceCategory}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-start gap-3 lg:items-end">
                    {application.reviewedAt && (
                      <p className="text-xs text-fg-subtle">Approved {decisionDate(application.reviewedAt)}</p>
                    )}
                    <RevokePaymentButton
                      action={revokeVendorPaymentApplicationAction}
                      applicationId={application.id}
                      companyName={application.partnership.vendorProfile.companyName}
                    />
                  </div>
                </div>
              </div>
            ))}
            {approvedApplications.length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-fg-subtle">
                No vendors approved for payment acceptance yet.
              </p>
            )}
          </div>
        </section>
      )}

      {activeTab === "rejected" && (
        <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
          <div className="divide-y divide-border">
            {rejectedApplications.map((application) => (
              <div key={application.id} className="p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-section-title text-fg">
                    {application.partnership.vendorProfile.companyName}
                  </h3>
                  <Badge tone="danger">Rejected</Badge>
                </div>
                {application.reviewNotes && (
                  <p className="mt-3 text-sm text-fg-muted">Note: {application.reviewNotes}</p>
                )}
              </div>
            ))}
            {rejectedApplications.length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-fg-subtle">No rejected requests.</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
