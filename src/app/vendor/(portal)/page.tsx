import Link from "next/link";

import { SectionHeader } from "@/components/layout/SectionHeader";
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
        <SectionHeader
          title={`Welcome, ${session.user.name}`}
          description={context.role === "OWNER" ? "Monitor every branch or open one for its QR code and activity." : "Monitor verification activity for your assigned branches."}
        />
        <VendorVerificationOverview
          companyName={displayBranch ? `${vendor.companyName} · ${displayBranch.name}` : vendor.companyName}
          verificationUrl={displayBranch?.verificationUrl ?? null}
          stats={stats}
          recentVerifications={recentVerifications}
          supportEmail={universityProfile?.contactEmail}
          liveCursor={encodeLiveVerificationCursor({ completedAt: new Date().toISOString(), id: "_" })}
          viewAllHref={viewAllHref}
        />
        <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <div className="border-b border-zinc-100 px-5 py-4"><h2 className="font-medium text-zinc-950">Branches</h2></div>
          <div className="divide-y divide-zinc-100">
            {vendor.branches.map((branch) => <Link className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-zinc-50" href={`/vendor/branches/${branch.id}`} key={branch.id}><span><span className="font-medium text-zinc-950">{branch.name}</span><span className="ml-2 text-xs text-zinc-500">{branch.status.replaceAll("_", " ")}</span></span><span className="text-sm text-zinc-500">View branch</span></Link>)}
          </div>
        </section>
      </div>
    );
  }

  const application = await getVendorApplicationForUser(session.user.id);

  const universityProfile = await getUniversityProfile();

  return (
    <div className="space-y-6">
      <SectionHeader
        title={`Welcome, ${session.user.name}`}
        description={
          application
            ? "Track your verifier application and manage your vendor profile."
            : "Apply to become an approved credential verifier."
        }
      />

      {application && (
        <section className="rounded-lg border border-zinc-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-zinc-950">Application status</h2>
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
          <p className="mt-2 text-sm text-zinc-600">
            {application.status === "DRAFT"
              ? "Your application is saved as a draft. Continue where you left off."
              : "View your application details."}
          </p>
          <Link
            className="mt-4 inline-flex h-9 items-center rounded-md border border-zinc-300 px-3 text-sm font-medium"
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
