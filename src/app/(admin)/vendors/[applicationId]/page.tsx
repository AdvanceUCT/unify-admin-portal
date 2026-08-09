import { notFound } from "next/navigation";

import { BackButton } from "@/components/ui/BackButton";
import { VendorApplicationDetails } from "@/features/vendors/VendorApplicationDetails";
import { requireRole } from "@/lib/auth/session";
import { getDocumentSignedUrl } from "@/lib/storage/supabase";
import { getVendorApplicationById } from "@/lib/vendors/applications";
import {
  approveVendorApplicationAction,
  rejectVendorApplicationAction,
  revokeVendorApplicationAction,
} from "../actions";
import { RejectForm } from "../RejectForm";
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
  searchParams,
}: {
  params: Promise<{ applicationId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireRole(["SUPER_ADMIN", "ADMIN"]);
  const { applicationId } = await params;
  const { tab } = await searchParams;
  const application = await getVendorApplicationById(applicationId);

  if (!application) {
    notFound();
  }

  const backHref = tab === "applications" ? "/vendors?tab=applications" : "/vendors";
  const backLabel = tab === "applications" ? "Back to applications" : "Back to vendors";
  const companyName = application.snapshotCompanyName ?? application.vendorProfile.companyName;
  const serviceCategory =
    application.snapshotServiceCategory ?? application.vendorProfile.serviceCategory;

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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <BackButton href={backHref} label={backLabel} />
        {application.status === "APPROVED" && (
          <RevokeButton
            action={revokeVendorApplicationAction}
            applicationId={application.id}
            companyName={companyName}
          />
        )}
      </div>

      <div>
        <h1 className="text-page-title text-fg">{companyName}</h1>
        <p className="mt-1 text-sm text-fg-subtle">{serviceCategory}</p>
      </div>

      <VendorApplicationDetails application={application} documentUrls={documentUrls} />

      {application.status === "PENDING" && (
        <div className="flex flex-col items-center gap-3 border-t border-border pt-6 sm:flex-row sm:justify-center">
          <form action={approveVendorApplicationAction}>
            <input name="applicationId" type="hidden" value={application.id} />
            <button
              className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg sm:w-auto"
              type="submit"
            >
              Approve
            </button>
          </form>
          <RejectForm action={rejectVendorApplicationAction} applicationId={application.id} />
        </div>
      )}
    </div>
  );
}
