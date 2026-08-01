import Link from "next/link";
import { notFound } from "next/navigation";

import { SectionHeader } from "@/components/layout/SectionHeader";
import { VendorApplicationDetails } from "@/features/vendors/VendorApplicationDetails";
import { requireRole } from "@/lib/auth/session";
import { getDocumentSignedUrl } from "@/lib/storage/supabase";
import { getVendorApplicationById } from "@/lib/vendors/applications";
import { revokeVendorApplicationAction } from "../actions";
import { RevokeButton } from "../RevokeButton";
import { MarkApplicationViewed } from "./MarkApplicationViewed";

const DOCUMENT_KEYS = [
  "docRegistrationCertificate",
  "docProofOfAddress",
  "docRepresentativeId",
  "docLetterOfAuthorisation",
  "docTaxCompliance",
  "docBusinessLicence",
] as const;

export default async function VendorApplicationDetailPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  await requireRole(["SUPER_ADMIN", "ADMIN"]);
  const { applicationId } = await params;
  const application = await getVendorApplicationById(applicationId);

  if (!application) {
    notFound();
  }

  // Generate signed URLs for any uploaded documents (1-hour expiry)
  const documentUrls: Record<string, string> = {};
  await Promise.all(
    DOCUMENT_KEYS.map(async (key) => {
      const path = application[key];
      if (!path) return;
      const url = await getDocumentSignedUrl(path);
      if (url) documentUrls[key] = url;
    }),
  );

  return (
    <div className="space-y-6">
      {application.status === "PENDING" && !application.viewedByAdminAt ? (
        <MarkApplicationViewed applicationId={application.id} />
      ) : null}
      <SectionHeader
        title="Vendor application"
        description={`Details for ${application.snapshotCompanyName ?? application.vendorProfile.companyName}.`}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/vendors" className="text-sm text-zinc-500 hover:text-zinc-800">
          ← Back to vendors
        </Link>
        {application.status === "APPROVED" && (
          <RevokeButton
            action={revokeVendorApplicationAction}
            applicationId={application.id}
            companyName={application.snapshotCompanyName ?? application.vendorProfile.companyName}
          />
        )}
      </div>

      <VendorApplicationDetails application={application} documentUrls={documentUrls} />
    </div>
  );
}
