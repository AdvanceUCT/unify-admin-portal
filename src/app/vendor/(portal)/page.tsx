/**
 * @fileoverview Renders the approved vendor dashboard.
 * @module app/vendor/(portal)/page
 */

import Link from "next/link";
import { ChevronRight, Mail } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { VendorApplicationLanding } from "@/features/vendors/VendorApplicationLanding";
import { VendorVerificationOverview } from "@/features/vendors/VendorVerificationOverview";
import { prisma } from "@/lib/db/prisma";
import { requireVendorSession } from "@/lib/auth/session";
import { getUniversityProfile } from "@/lib/university/profile";
import { getVendorApplicationForUser } from "@/lib/vendors/applications";
import { getApprovedVendorContextForUser } from "@/lib/vendors/context";
import { encodeLiveVerificationCursor } from "@/lib/vendors/liveVerifications";
import { getVendorVerificationStats, listRecentVendorVerifications } from "@/lib/vendors/verifications";

export default async function VendorDashboardPage() {
  const session = await requireVendorSession();
  const context = await getApprovedVendorContextForUser(session.user.id);

  if (context) {
    const vendor = await prisma.vendorProfile.findUnique({
      where: { id: context.vendorProfileId },
      include: {
        branches: {
          where: context.role === "STAFF" ? { id: { in: context.branchIds } } : {},
          orderBy: { name: "asc" },
        },
        defaultBranch: true,
      },
    });
    if (!vendor) return null;
    const displayBranch =
      (vendor.defaultBranch && context.branchIds.includes(vendor.defaultBranch.id) ? vendor.defaultBranch : null) ??
      vendor.branches[0] ??
      null;
    const [stats, recentVerifications, universityProfile] = await Promise.all([
      getVendorVerificationStats(context.vendorProfileId, { branchIds: context.branchIds, inPersonOnly: true }),
      listRecentVendorVerifications(context.vendorProfileId, 5, { branchIds: context.branchIds, inPersonOnly: true }),
      getUniversityProfile(),
    ]);
    const viewAllHref = context.branchIds.length === 1
      ? `/vendor/verifications?branchId=${encodeURIComponent(context.branchIds[0])}`
      : "/vendor/verifications";

    return (
      <div className="space-y-6">
        <VendorVerificationOverview
          companyName={displayBranch ? `${vendor.companyName} · ${displayBranch.name}` : vendor.companyName}
          vendorId={vendor.id}
          verificationUrl={displayBranch?.verificationUrl ?? null}
          stats={stats}
          recentVerifications={recentVerifications}
          liveCursor={encodeLiveVerificationCursor({ completedAt: new Date().toISOString(), id: "_" })}
          viewAllHref={viewAllHref}
        />
        <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
          <div className="border-b border-border px-5 py-4"><h2 className="text-section-title text-fg">Branches</h2></div>
          <div className="divide-y divide-border">
            {vendor.branches.map((branch) => (
              <Link
                className="flex items-center justify-between gap-3 px-5 py-4 transition hover:bg-surface-muted/60"
                href={`/vendor/branches/${branch.id}`}
                key={branch.id}
              >
                <span className="min-w-0">
                  <span className="font-medium text-fg">{branch.name}</span>
                  <span
                    className={`ml-2 text-xs font-medium ${
                      branch.status === "ACTIVE"
                        ? "text-success-fg"
                        : branch.status === "PROVISIONING_FAILED"
                          ? "text-danger-fg"
                          : "text-warning-fg"
                    }`}
                  >
                    {branch.status.replaceAll("_", " ")}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-brand-700">
                  View branch
                  <ChevronRight aria-hidden="true" size={16} />
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="flex items-center gap-3 rounded-xl border border-border bg-surface p-5 shadow-md">
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-brand-50 text-brand-700">
            <Mail size={18} aria-hidden="true" />
          </span>
          <div>
            <p className="font-medium text-fg">Need help?</p>
            {universityProfile?.contactEmail ? (
              <p className="text-sm text-fg-muted">
                Contact{" "}
                <a className="font-medium text-fg underline" href={`mailto:${universityProfile.contactEmail}`}>
                  {universityProfile.contactEmail}
                </a>{" "}
                if you have any questions about verification services.
              </p>
            ) : (
              <p className="text-sm text-fg-muted">Contact your university administrator for verification support.</p>
            )}
          </div>
        </section>
      </div>
    );
  }

  const application = await getVendorApplicationForUser(session.user.id);

  const universityProfile = await getUniversityProfile();

  return (
    <div className="space-y-6">
      {application && (
        <section className="rounded-xl border border-border bg-surface p-5 shadow-md">
          <div className="flex items-center justify-between">
            <h2 className="text-section-title text-fg">Application status</h2>
            <Badge
              tone={
                application.status === "PENDING"
                  ? "warning"
                  : application.status === "DRAFT"
                    ? "neutral"
                    : "danger"
              }
            >
              {application.status}
            </Badge>
          </div>
          <p className="mt-2 text-sm text-fg-muted">
            {application.status === "DRAFT"
              ? "Your application is saved as a draft. Continue where you left off."
              : "View your application details."}
          </p>
          <Link
            className="mt-4 inline-flex h-9 items-center rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700"
            href="/vendor/application"
          >
            {application.status === "DRAFT" ? "Continue application" : "View application"}
          </Link>
        </section>
      )}

      <VendorApplicationLanding
        universityName={universityProfile?.name}
        supportEmail={universityProfile?.contactEmail}
        applicationStatus={application?.status === "APPROVED" ? undefined : application?.status}
      />
    </div>
  );
}
