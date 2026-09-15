/**
 * @fileoverview Renders the authenticated administrator page at `/vendors`.
 * @module app/(admin)/vendors/page
 */

import Link from "next/link";
import { Banknote, Check, Eye, Globe, History, Link as LinkIcon, Mail, QrCode, TriangleAlert, User } from "lucide-react";

import { PageTabs } from "@/components/layout/PageTabs";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import {
  PaymentAccessDecisionTable,
  VendorApplicationDecisionTable,
} from "@/features/audit/DecisionLogTables";
import { requireRoleForRender } from "@/lib/auth/session";
import {
  listBranchPaymentAccessQueue,
  listPaymentAccessDecisions,
} from "@/lib/payments/branchOnboarding";
import {
  listDecidedVendorApplications,
  listVendorApplications,
} from "@/lib/vendors/applications";
import { applicationReasonLabels } from "@/lib/vendors/application-reasons";
import {
  approveBranchPaymentApplicationAction,
  approveVendorApplicationAction,
  createVendorVerificationQrAction,
  rejectBranchPaymentApplicationAction,
  rejectVendorApplicationAction,
  revokeBranchPaymentAcceptanceAction,
  revokeVendorApplicationAction,
} from "./actions";
import { PaymentAccessRevokeButton } from "./PaymentAccessRevokeButton";
import { RejectForm } from "./RejectForm";
import { RevokeButton } from "./RevokeButton";

const DECISION_PAGE_SIZE = 5;

function decisionDate(value: Date | string) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function parsePage(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(rawValue ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function paginateDecisions<T>(items: T[], page: number, pageSize: number) {
  const totalCount = items.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const normalizedPage = Math.min(page, totalPages);
  const start = (normalizedPage - 1) * pageSize;

  return {
    items: items.slice(start, start + pageSize),
    page: normalizedPage,
    pageSize,
    totalCount,
    totalPages,
  };
}

function vendorsDecisionHref(vendorPage: number, paymentPage: number) {
  return `/vendors?tab=log&vendorDecisionPage=${vendorPage}&paymentDecisionPage=${paymentPage}`;
}

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<{
    paymentDecisionPage?: string | string[];
    tab?: string;
    vendorDecisionPage?: string | string[];
  }>;
}) {
  await requireRoleForRender(["SUPER_ADMIN", "ADMIN"]);

  const { paymentDecisionPage, tab, vendorDecisionPage } = await searchParams;
  const activeTab =
    tab === "applications" ? "applications" : tab === "payments" ? "payments" : tab === "log" ? "log" : "vendors";

  const [approvedApplications, pendingApplications, rejectedApplications, decidedApplications, paymentAccess, paymentDecisions] =
    await Promise.all([
      listVendorApplications({ status: "APPROVED" }),
      listVendorApplications({ status: "PENDING" }),
      listVendorApplications({ status: "REJECTED" }),
      listDecidedVendorApplications(),
      listBranchPaymentAccessQueue(),
      listPaymentAccessDecisions({
        page: parsePage(paymentDecisionPage),
        pageSize: DECISION_PAGE_SIZE,
      }),
    ]);
  const vendorDecisions = paginateDecisions(
    decidedApplications,
    parsePage(vendorDecisionPage),
    DECISION_PAGE_SIZE,
  );
  const approvedPaymentGroups = Array.from(
    paymentAccess.activeAcceptances.reduce((groups, acceptance) => {
      const vendor = acceptance.vendorBranch.vendorProfile;
      const existing = groups.get(vendor.id);
      if (existing) {
        existing.acceptances.push(acceptance);
      } else {
        groups.set(vendor.id, {
          acceptances: [acceptance],
          companyName: vendor.companyName,
          serviceCategory: vendor.serviceCategory,
          vendorId: vendor.id,
        });
      }
      return groups;
    }, new Map<string, {
      acceptances: typeof paymentAccess.activeAcceptances;
      companyName: string;
      serviceCategory: string;
      vendorId: string;
    }>()),
  ).map(([, group]) => group);

  return (
    <div className="space-y-6">
      <PageTabs
        tabs={[
          {
            count: approvedApplications.length,
            href: "/vendors",
            isActive: activeTab === "vendors",
            label: "Active Vendors",
          },
          {
            count: pendingApplications.length,
            href: "/vendors?tab=applications",
            isActive: activeTab === "applications",
            label: "Applications",
          },
          {
            count: paymentAccess.pendingApplications.length,
            href: "/vendors?tab=payments",
            isActive: activeTab === "payments",
            label: "Payment Access",
          },
          { href: "/vendors?tab=log", isActive: activeTab === "log", label: "Decision Log" },
        ]}
      />

      {/* Active Vendors tab */}
      {activeTab === "vendors" && (
        <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
          <div className="divide-y divide-border">
            {approvedApplications.map((application) => (
              <div key={application.id} className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex min-w-0 flex-1 gap-4">
                    <Avatar className="mt-0.5" name={application.vendorProfile.companyName} size="lg" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-section-title text-fg">
                          {application.vendorProfile.companyName}
                        </h2>
                        <Badge tone="success">Active</Badge>
                      </div>
                      <p className="mt-0.5 text-sm text-fg-subtle">
                        {application.vendorProfile.serviceCategory}
                        {application.companyRegistrationNumber && (
                          <> &middot; Reg. {application.companyRegistrationNumber}</>
                        )}
                      </p>

                      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-fg-muted">
                        {application.vendorProfile.contactPersonName && (
                          <span className="flex items-center gap-1.5">
                            <User className="size-3.5 shrink-0 text-fg-subtle" />
                            {application.vendorProfile.contactPersonName}
                          </span>
                        )}
                        <span className="flex items-center gap-1.5">
                          <Mail className="size-3.5 shrink-0 text-fg-subtle" />
                          {application.vendorProfile.contactEmail}
                        </span>
                        {application.vendorProfile.website && (
                          <span className="flex items-center gap-1.5">
                            <Globe className="size-3.5 shrink-0 text-fg-subtle" />
                            <a
                              className="text-info-fg hover:underline"
                              href={application.vendorProfile.website}
                              rel="noreferrer"
                              target="_blank"
                            >
                              {application.vendorProfile.website.replace(/^https?:\/\//, "")}
                            </a>
                          </span>
                        )}
                      </div>

                      <div className="mt-3 rounded-lg border border-border bg-surface-muted/60 p-3">
                        {application.vendorProfile.verificationUrl ? (
                          <div className="flex min-w-0 items-center gap-2 text-xs">
                            <LinkIcon className="size-3.5 shrink-0 text-fg-subtle" />
                            <a
                              className="min-w-0 flex-1 truncate font-medium text-info-fg hover:underline"
                              href={application.vendorProfile.verificationUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {application.vendorProfile.verificationUrl}
                            </a>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-xs font-medium text-warning-fg">
                            <TriangleAlert className="size-3.5 shrink-0" />
                            Verification QR setup pending
                          </div>
                        )}
                        <p className="mt-1.5 text-xs text-fg-subtle">
                          Verification requests include all attributes in the active student credential schema.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-start gap-3 lg:items-end">
                    {application.reviewedAt && (
                      <p className="text-xs text-fg-subtle">
                        Approved {decisionDate(application.reviewedAt)}
                      </p>
                    )}
                    <div className="flex flex-col items-stretch gap-2">
                      <Link
                        href={`/vendors/${application.id}/verification-history`}
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg"
                      >
                        <History aria-hidden className="size-4" />
                        Verification history
                      </Link>
                      <Link
                        href={`/vendors/${application.id}/payout-history`}
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg"
                      >
                        <Banknote aria-hidden className="size-4" />
                        Payout history
                      </Link>
                      {!application.vendorProfile.verificationUrl && (
                        <form action={createVendorVerificationQrAction}>
                          <input
                            type="hidden"
                            name="vendorProfileId"
                            value={application.vendorProfileId}
                          />
                          <button
                            className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg"
                            type="submit"
                          >
                            <QrCode aria-hidden className="size-4" />
                            Create verification QR
                          </button>
                        </form>
                      )}
                      <RevokeButton
                        applicationId={application.id}
                        companyName={application.vendorProfile.companyName}
                        action={revokeVendorApplicationAction}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {approvedApplications.length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-fg-subtle">
                No approved vendors yet. Approve a verifier application to onboard them.
              </p>
            )}
          </div>
        </section>
      )}

      {/* Applications tab */}
      {activeTab === "applications" && (
        <div className="space-y-6">
          {/* Pending */}
          <div>
            <h2 className="mb-3 text-caption font-medium uppercase tracking-wide text-fg-subtle">
              Pending ({pendingApplications.length})
            </h2>
            <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
              <div className="divide-y divide-border">
                {pendingApplications.map((application) => {
                  const isNew = !application.viewedByAdminAt;
                  const companyName =
                    application.snapshotCompanyName ?? application.vendorProfile.companyName;
                  return (
                    <div key={application.id} className="p-5">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex min-w-0 flex-1 gap-4">
                          <Avatar className="mt-0.5" name={companyName} size="lg" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-section-title text-fg">{companyName}</h3>
                              <Badge tone="warning">Pending</Badge>
                              {isNew && <Badge tone="version">New</Badge>}
                            </div>
                            <p className="mt-0.5 text-sm text-fg-subtle">
                              {application.snapshotServiceCategory ?? application.vendorProfile.serviceCategory}
                            </p>
                            <div className="mt-3">
                              <p className="text-caption font-medium uppercase tracking-wide text-fg-subtle">
                                Reason for application
                              </p>
                              <ul className="mt-1.5 space-y-1">
                                {applicationReasonLabels(
                                  application.applicationReasons,
                                  application.otherApplicationReason,
                                ).map((label) => (
                                  <li className="flex items-start gap-2 text-sm text-fg-muted" key={label}>
                                    <Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-success-fg" />
                                    <span>{label}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-col items-start gap-3 lg:items-end">
                          <p className="text-xs text-fg-subtle">
                            Submitted {decisionDate(application.createdAt)}
                          </p>
                          <div className="flex flex-col items-stretch gap-2">
                            <Link
                              href={`/vendors/${application.id}?tab=applications`}
                              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg"
                            >
                              <Eye aria-hidden className="size-4" />
                              View
                            </Link>
                            <form action={approveVendorApplicationAction}>
                              <input type="hidden" name="applicationId" value={application.id} />
                              <button
                                className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-success-border bg-success-bg px-3 text-sm font-medium text-success-fg transition hover:bg-success-border"
                                type="submit"
                              >
                                <Check aria-hidden className="size-4" />
                                Approve
                              </button>
                            </form>
                            <RejectForm
                              action={rejectVendorApplicationAction}
                              applicationId={application.id}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {pendingApplications.length === 0 && (
                  <p className="px-5 py-6 text-sm text-fg-subtle">No pending applications.</p>
                )}
              </div>
            </section>
          </div>

          {/* Rejected */}
          {rejectedApplications.length > 0 && (
            <div>
              <h2 className="mb-3 text-caption font-medium uppercase tracking-wide text-fg-subtle">
                Rejected ({rejectedApplications.length})
              </h2>
              <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
                <div className="divide-y divide-border">
                  {rejectedApplications.map((application) => {
                    const companyName =
                      application.snapshotCompanyName ?? application.vendorProfile.companyName;
                    return (
                      <div key={application.id} className="p-5">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="flex min-w-0 flex-1 gap-4">
                            <Avatar className="mt-0.5" name={companyName} size="lg" />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-section-title text-fg">{companyName}</h3>
                                <Badge tone="danger">Rejected</Badge>
                              </div>
                              <p className="mt-0.5 text-sm text-fg-subtle">
                                {application.snapshotServiceCategory ?? application.vendorProfile.serviceCategory}
                              </p>
                              {application.reviewNotes && (
                                <p className="mt-3 text-sm text-fg-muted">
                                  Note: {application.reviewNotes}
                                </p>
                              )}
                            </div>
                          </div>
                          {application.reviewedAt && (
                            <p className="shrink-0 text-xs text-fg-subtle">
                              {decisionDate(application.reviewedAt)}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          )}
        </div>
      )}

      {/* Payment Access tab */}
      {activeTab === "payments" && (
        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-surface p-5 shadow-md">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-section-title text-fg">Branch payment access</h2>
                <p className="mt-1 text-sm text-fg-subtle">
                  Review branch-level requests to accept UNIFY wallet payments.
                </p>
              </div>
              <Link
                className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-surface px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg"
                href="/payments/about"
              >
                How payments work
              </Link>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
            <div className="border-b border-border px-5 py-4">
              <h3 className="text-section-title text-fg">
                Pending requests ({paymentAccess.pendingApplications.length})
              </h3>
            </div>
            <div className="divide-y divide-border">
              {paymentAccess.pendingApplications.length === 0 ? (
                <p className="px-5 py-6 text-sm text-fg-subtle">No pending payment-access requests.</p>
              ) : (
                paymentAccess.pendingApplications.map((application) => {
                  const hasPayoutSnapshot = Boolean(application.payoutDestinationReferenceSnapshot);
                  const hasAcknowledgement = Boolean(application.studentDataAcknowledgedAt);
                  return (
                    <div className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between" key={application.id}>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-medium text-fg">
                            {application.vendorBranch.vendorProfile.companyName}
                          </h4>
                          <Badge tone="warning">Pending</Badge>
                        </div>
                        <p className="mt-1 text-sm text-fg-subtle">
                          {application.vendorBranch.name} &middot; {application.vendorBranch.vendorProfile.serviceCategory}
                        </p>
                        <p className="mt-0.5 text-xs text-fg-muted">
                          {application.vendorBranch.address || "No branch location supplied"}
                        </p>
                        <p className="mt-0.5 text-xs text-fg-subtle">
                          Submitted {application.submittedAt ? decisionDate(application.submittedAt) : decisionDate(application.createdAt)}
                          {!hasPayoutSnapshot || !hasAcknowledgement ? " / missing application details" : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <Link
                          className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg"
                          href={`/vendors/payment-access/${application.vendorBranchId}`}
                        >
                          <Eye aria-hidden className="size-4" />
                          View
                        </Link>
                        <form action={approveBranchPaymentApplicationAction}>
                          <input name="applicationId" type="hidden" value={application.id} />
                          <input name="branchId" type="hidden" value={application.vendorBranchId} />
                          <button
                            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-success-border bg-success-bg px-3 text-sm font-medium text-success-fg transition hover:bg-success-border disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={!hasPayoutSnapshot || !hasAcknowledgement}
                            type="submit"
                          >
                            <Check aria-hidden className="size-4" />
                            Approve
                          </button>
                        </form>
                        <RejectForm
                          action={rejectBranchPaymentApplicationAction}
                          applicationId={application.id}
                          hiddenFields={{ branchId: application.vendorBranchId }}
                          label="Deny"
                          reasonLabel="Reason for denial"
                          title="Deny payment access"
                          confirmLabel="Confirm denial"
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
            <div className="border-b border-border px-5 py-4">
              <h3 className="text-section-title text-fg">
                Approved payment branches ({paymentAccess.activeAcceptances.length})
              </h3>
            </div>
            <div className="divide-y divide-border">
              {approvedPaymentGroups.length === 0 ? (
                <p className="px-5 py-6 text-sm text-fg-subtle">No branches are approved for wallet payments yet.</p>
              ) : (
                approvedPaymentGroups.map((group) => (
                  <details className="group p-0" key={group.vendorId}>
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 transition hover:bg-surface-muted/60">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-medium text-fg">{group.companyName}</h4>
                          <Badge tone="success">{group.acceptances.length} approved</Badge>
                        </div>
                        <p className="mt-0.5 text-sm text-fg-subtle">{group.serviceCategory}</p>
                      </div>
                      <span className="shrink-0 text-sm font-medium text-fg-muted group-open:hidden">Show</span>
                      <span className="hidden shrink-0 text-sm font-medium text-fg-muted group-open:inline">Hide</span>
                    </summary>
                    <div className="mx-5 mb-5 divide-y divide-border rounded-lg border border-border">
                      {group.acceptances.map((acceptance) => (
                        <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between" key={acceptance.id}>
                          <div>
                            <p className="font-medium text-fg">{acceptance.vendorBranch.name}</p>
                            <p className="mt-1 text-sm text-fg-subtle">
                              QR {acceptance.qrIdentifier} &middot; Approved {decisionDate(acceptance.approvedAt)}
                            </p>
                          </div>
                          <PaymentAccessRevokeButton
                            action={revokeBranchPaymentAcceptanceAction}
                            branchId={acceptance.vendorBranchId}
                            branchName={acceptance.vendorBranch.name}
                            companyName={group.companyName}
                          />
                        </div>
                      ))}
                    </div>
                  </details>
                ))
              )}
            </div>
          </section>
        </div>
      )}

      {/* Decision Log tab */}
      {activeTab === "log" && (
        <div className="space-y-6">
          <VendorApplicationDecisionTable
            decisions={vendorDecisions.items}
            hrefForPage={(page) => vendorsDecisionHref(page, paymentDecisions.page)}
            page={vendorDecisions.page}
            pageSize={vendorDecisions.pageSize}
            totalCount={vendorDecisions.totalCount}
            totalPages={vendorDecisions.totalPages}
          />
          <PaymentAccessDecisionTable
            decisions={paymentDecisions.decisions}
            hrefForPage={(page) => vendorsDecisionHref(vendorDecisions.page, page)}
            page={paymentDecisions.page}
            pageSize={paymentDecisions.pageSize}
            totalCount={paymentDecisions.totalCount}
            totalPages={paymentDecisions.totalPages}
          />
        </div>
      )}
    </div>
  );
}
