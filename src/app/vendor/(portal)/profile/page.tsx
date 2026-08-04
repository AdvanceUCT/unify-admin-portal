import { SectionHeader } from "@/components/layout/SectionHeader";
import { requireVendorSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

import { SubVendorProfileForm } from "./SubVendorProfileForm";
import { VendorProfileForm } from "./VendorProfileForm";

export default async function VendorProfilePage() {
  const session = await requireVendorSession();
  const profile = await prisma.vendorProfile.findUnique({
    where: { userId: session.user.id },
    include: {
      parentVendorProfile: {
        select: {
          companyName: true,
          serviceCategory: true,
        },
      },
    },
  });

  if (profile?.parentVendorProfileId) {
    return (
      <div className="space-y-6">
        <SectionHeader title="Location profile" description="Your location details on file." />

        <SubVendorProfileForm
          initialProfile={{
            companyName: profile.parentVendorProfile?.companyName ?? profile.companyName,
            serviceCategory: profile.parentVendorProfile?.serviceCategory ?? profile.serviceCategory,
            locationName: profile.locationName ?? "",
            locationAddress: profile.locationAddress ?? "",
            contactPersonName: profile.contactPersonName ?? "",
            contactEmail: profile.contactEmail ?? "",
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader title="Vendor profile" description="Your company details on file." />

      <VendorProfileForm
        initialProfile={{
          companyName: profile?.companyName ?? "",
          serviceCategory: profile?.serviceCategory ?? "",
          contactPersonName: profile?.contactPersonName ?? "",
          contactEmail: profile?.contactEmail ?? "",
        }}
      />
    </div>
  );
}
