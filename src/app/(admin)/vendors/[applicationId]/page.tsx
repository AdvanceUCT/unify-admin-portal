import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { SectionHeader } from "@/components/layout/SectionHeader";
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
        <Link
          href={backHref}
          className="group inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-800"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-full border border-zinc-300 text-zinc-700 transition group-hover:border-zinc-400 group-hover:text-zinc-900">
            <ArrowLeft aria-hidden className="size-5" />
          </span>
          {backLabel}
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

      {application.status === "PENDING" && (
        <div className="flex flex-col items-center gap-3 border-t border-zinc-200 pt-6 sm:flex-row sm:justify-center">
          <form action={approveVendorApplicationAction}>
            <input name="applicationId" type="hidden" value={application.id} />
            <button
              className="h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 sm:w-auto"
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
