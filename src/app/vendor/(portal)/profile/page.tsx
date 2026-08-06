import { SectionHeader } from "@/components/layout/SectionHeader";
import { requireVendorSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getApprovedVendorContextForUser } from "@/lib/vendors/context";
import { forbidden } from "next/navigation";

import { VendorProfileForm } from "./VendorProfileForm";

export default async function VendorProfilePage() {
  const session = await requireVendorSession();
  const context = await getApprovedVendorContextForUser(session.user.id);
  if (context?.role === "STAFF") forbidden();
  const profile = await prisma.vendorProfile.findUnique({
    where: { userId: session.user.id },
  });

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
