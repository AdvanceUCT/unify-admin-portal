import Link from "next/link";
import { forbidden } from "next/navigation";

import { SectionHeader } from "@/components/layout/SectionHeader";
import { Badge } from "@/components/ui/Badge";
import { VendorApplicationLanding } from "@/features/vendors/VendorApplicationLanding";
import { VendorVerificationOverview } from "@/features/vendors/VendorVerificationOverview";
import { requireVendorSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getUniversityProfile } from "@/lib/university/profile";
import { getVendorAccountContext } from "@/lib/vendors/account";
import { getVendorApplicationForUser } from "@/lib/vendors/applications";
import { getVendorVerificationStats, listRecentVendorVerifications } from "@/lib/vendors/verifications";

export default async function VendorDashboardPage() {
  const session = await requireVendorSession();
  const vendorContext = await getVendorAccountContext(session.user.id);
  const application = await getVendorApplicationForUser(session.user.id);

  if (vendorContext?.isSubVendor && !vendorContext.isApproved) {
    forbidden();
  }

  if (vendorContext?.isApproved) {
    const [stats, recentVerifications, universityProfile, locationCount] = await Promise.all([
      getVendorVerificationStats(vendorContext.operationalProfileIds),
      listRecentVendorVerifications(vendorContext.operationalProfileIds),
      getUniversityProfile(),
      vendorContext.isParent
        ? prisma.vendorProfile.count({ where: { parentVendorProfileId: vendorContext.profile.id } })
        : Promise.resolve(0),
    ]);
    const displayName =
      vendorContext.profile.locationName ?? vendorContext.profile.companyName;

    return (
      <div className="space-y-6">
        <SectionHeader
          title={`Welcome, ${session.user.name}`}
          description={
            vendorContext.isParent
              ? "View aggregate verification activity and manage your parent vendor service point."
              : "Share your location's verification QR code with students so they can verify your service instantly."
          }
        />
        {vendorContext.isParent ? (
          <section className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-medium text-zinc-950">Sub-vendor locations</h2>
              <p className="mt-1 text-sm text-zinc-500">
                {locationCount} location{locationCount === 1 ? "" : "s"} connected to this parent vendor.
              </p>
            </div>
            <Link
              className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-medium"
              href="/vendor/locations"
            >
              Manage locations
            </Link>
          </section>
        ) : null}
        <VendorVerificationOverview
          companyName={displayName}
          verificationUrl={vendorContext.profile.verificationUrl}
          stats={stats}
          recentVerifications={recentVerifications}
          supportEmail={universityProfile?.contactEmail}
        />
      </div>
    );
  }

  const universityProfile = await getUniversityProfile();
  const applicationLandingStatus =
    application?.status === "APPROVED" ? undefined : application?.status;

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
        applicationStatus={applicationLandingStatus}
      />
    </div>
  );
}
