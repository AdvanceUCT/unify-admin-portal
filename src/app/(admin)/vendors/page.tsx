import Link from "next/link";
import { Check, Eye, Globe, History, Link as LinkIcon, Mail, QrCode, TriangleAlert, User } from "lucide-react";

import { PageTabs } from "@/components/layout/PageTabs";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { StatusText } from "@/components/ui/StatusText";
import { DecisionNoteButton } from "@/features/audit/DecisionNoteButton";
import { requireRole } from "@/lib/auth/session";
import {
  listDecidedVendorApplications,
  listVendorApplications,
} from "@/lib/vendors/applications";
import { verificationReasonLabels } from "@/lib/vendors/verification-reasons";
import {
  approveVendorApplicationAction,
  createVendorVerificationQrAction,
  rejectVendorApplicationAction,
  revokeVendorApplicationAction,
} from "./actions";
import { RejectForm } from "./RejectForm";
import { RevokeButton } from "./RevokeButton";

function decisionDate(value: Date | string) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireRole(["SUPER_ADMIN", "ADMIN"]);

  const { tab } = await searchParams;
  const activeTab =
    tab === "applications" ? "applications" : tab === "log" ? "log" : "vendors";

  const [approvedApplications, pendingApplications, rejectedApplications, decidedApplications] =
    await Promise.all([
      listVendorApplications({ status: "APPROVED" }),
      listVendorApplications({ status: "PENDING" }),
      listVendorApplications({ status: "REJECTED" }),
      listDecidedVendorApplications(),
    ]);

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
                                Reasons for verification
                              </p>
                              <ul className="mt-1.5 space-y-1">
                                {verificationReasonLabels(
                                  application.verificationReasons,
                                  application.otherVerificationReason,
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

      {/* Decision Log tab */}
      {activeTab === "log" && (
        <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-section-title text-fg">Application decisions</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-center text-body">
              <thead className="border-b border-border">
                <tr className="whitespace-nowrap text-caption uppercase tracking-wide text-fg-subtle">
                  <th className="px-5 py-3 font-medium">Company</th>
                  <th className="px-5 py-3 font-medium">Category</th>
                  <th className="px-5 py-3 font-medium">Decision</th>
                  <th className="px-5 py-3 font-medium">Decided by</th>
                  <th className="px-5 py-3 font-medium">Notes</th>
                  <th className="px-5 py-3 font-medium">Decided</th>
                  <th className="px-5 py-3 font-medium">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {decidedApplications.length === 0 ? (
                  <tr>
                    <td className="px-5 py-10 text-fg-subtle" colSpan={7}>
                      No decisions have been made yet.
                    </td>
                  </tr>
                ) : (
                  decidedApplications.map((application) => (
                    <tr className="transition hover:bg-surface-muted/60" key={application.id}>
                      <td className="px-5 py-4">
                        <div className="font-medium text-fg">{application.companyName}</div>
                        {application.companyRegistrationNumber && (
                          <div className="text-xs text-fg-subtle">
                            Reg. {application.companyRegistrationNumber}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4 text-fg-muted">{application.serviceCategory}</td>
                      <td className="px-5 py-4">
                        {application.status === "APPROVED" ? (
                          <StatusText tone="success">Approved</StatusText>
                        ) : application.status === "REVOKED" ? (
                          <StatusText tone="warning">Revoked</StatusText>
                        ) : (
                          <StatusText tone="danger">Rejected</StatusText>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-fg-muted">
                        {application.decisionActorName ?? (
                          <span className="text-fg-subtle">Unknown</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {application.decisionNotes ? (
                          <DecisionNoteButton
                            companyName={application.companyName}
                            note={application.decisionNotes}
                          />
                        ) : (
                          <span className="text-fg-subtle">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 tabular-nums text-fg-muted">
                        {application.decisionAt ? (
                          decisionDate(application.decisionAt)
                        ) : (
                          <span className="text-fg-subtle">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 tabular-nums text-fg-muted">
                        {decisionDate(application.createdAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
