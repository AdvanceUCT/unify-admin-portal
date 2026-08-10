import { forbidden } from "next/navigation";

import { VendorLogoUpload } from "@/features/vendors/VendorLogoUpload";
import { requireVendorSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getDocumentSignedUrl } from "@/lib/storage/supabase";
import { getApprovedVendorContextForUser } from "@/lib/vendors/context";

import { VendorProfileForm } from "./VendorProfileForm";

export default async function VendorProfilePage() {
  const session = await requireVendorSession();
  const context = await getApprovedVendorContextForUser(session.user.id);
  if (context?.role === "STAFF") forbidden();
  const profile = await prisma.vendorProfile.findUnique({
    where: { userId: session.user.id },
  });
  const logoUrl = profile?.logoPath
    ? await getDocumentSignedUrl(profile.logoPath)
    : null;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-surface p-5 shadow-md">
        <p className="mb-3 text-sm font-medium text-fg-muted">
          Organisation logo
        </p>
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
