import Link from "next/link";

import { SectionHeader } from "@/components/layout/SectionHeader";
import { Badge } from "@/components/ui/Badge";
import { VendorVerificationOverview } from "@/features/vendors/VendorVerificationOverview";
import { requireVendorSession } from "@/lib/auth/session";
import { getUniversityProfile } from "@/lib/university/profile";
import { getVendorApplicationForUser } from "@/lib/vendors/applications";
import { getVendorVerificationStats, listRecentVendorVerifications } from "@/lib/vendors/verifications";

export default async function VendorDashboardPage() {
  const session = await requireVendorSession();
  const application = await getVendorApplicationForUser(session.user.id);

  if (application?.status === "APPROVED") {
    const [stats, recentVerifications, universityProfile] = await Promise.all([
      getVendorVerificationStats(application.vendorProfileId),
      listRecentVendorVerifications(application.vendorProfileId),
      getUniversityProfile(),
    ]);

    return (
      <div className="space-y-6">
        <SectionHeader
          title={`Welcome, ${session.user.name}`}
          description="Share your verification QR code with students so they can verify your service instantly."
        />
        <VendorVerificationOverview
          companyName={application.vendorProfile.companyName}
          verificationUrl={application.vendorProfile.verificationUrl}
          stats={stats}
          recentVerifications={recentVerifications}
          supportEmail={universityProfile?.contactEmail}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title={`Welcome, ${session.user.name}`}
        description="Track your verifier application and manage your vendor profile."
      />

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-zinc-950">Application status</h2>
          {application ? (
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
          ) : null}
        </div>
        <p className="mt-2 text-sm text-zinc-600">
          {application?.status === "DRAFT"
            ? "Your application is saved as a draft. Continue where you left off."
            : application
              ? "View your application details."
              : "You haven't submitted a verifier application yet."}
        </p>
        <Link
          className="mt-4 inline-flex h-9 items-center rounded-md border border-zinc-300 px-3 text-sm font-medium"
          href="/vendor/application"
        >
          {application?.status === "DRAFT"
            ? "Continue application"
            : application
              ? "View application"
              : "Apply now"}
        </Link>
      </section>
    </div>
  );
}
