import { SectionHeader } from "@/components/layout/SectionHeader";
import { VendorLogoUpload } from "@/features/vendors/VendorLogoUpload";
import { requireVendorSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getDocumentSignedUrl } from "@/lib/storage/supabase";
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
  const logoUrl = profile?.logoPath ? await getDocumentSignedUrl(profile.logoPath) : null;

  return (
    <div className="space-y-6">
      <SectionHeader title="Vendor profile" description="Your company details on file." />

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <p className="mb-3 text-sm font-medium text-zinc-700">Organisation logo</p>
        <VendorLogoUpload initialLogoUrl={logoUrl} />
      </section>

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
