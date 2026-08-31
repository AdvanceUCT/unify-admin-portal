/**
 * @fileoverview Renders the approved vendor page at `/vendor/application`.
 * @module app/vendor/(portal)/application/page
 */

import Link from "next/link";
import { forbidden } from "next/navigation";
import { ClipboardList, Info } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { VendorApplicationDetails } from "@/features/vendors/VendorApplicationDetails";
import { VendorApplicationHistory } from "@/features/vendors/VendorApplicationHistory";
import { VendorApplicationSummary } from "@/features/vendors/VendorApplicationSummary";
import { TOTAL_STEPS, VendorApplicationWizard } from "@/features/vendors/application/VendorApplicationWizard";
import type { DraftApplicationData } from "@/features/vendors/application/VendorApplicationWizard";
import { requireVendorSession } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/formatters";
import { filenameFromStoragePath, getDocumentSignedUrl } from "@/lib/storage/supabase";
import { getApprovedVendorContextForUser } from "@/lib/vendors/context";
import {
  computeDraftProgress,
  listVendorApplicationsForUser,
} from "@/lib/vendors/applications";

const DOCUMENT_FIELD_KEYS = [
  "docRegistrationCertificate",
  "docProofOfAddress",
  "docRepresentativeId",
  "docLetterOfAuthorisation",
  "docTaxCompliance",
  "docBusinessLicence",
] as const;

export default async function VendorApplicationPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; step?: string }>;
}) {
  const { start, step } = await searchParams;
  const session = await requireVendorSession();
  const context = await getApprovedVendorContextForUser(session.user.id);
  if (context?.role === "STAFF") forbidden();
  const applications = await listVendorApplicationsForUser(session.user.id);
  const application = applications[0] ?? null;
  const history = applications.slice(1);
  const previousDecision =
    applications.find((a) => a.status === "REJECTED" || a.status === "REVOKED") ?? null;

  if (!application && start !== "1") {
    return (
      <div className="space-y-6">
        <section className="flex flex-col items-center gap-4 rounded-xl border border-border bg-surface p-10 text-center shadow-md">
          <span className="grid size-12 place-items-center rounded-full bg-brand-50 text-brand-700">
            <ClipboardList size={24} aria-hidden="true" />
          </span>
          <div>
            <p className="text-section-title text-fg">Start application?</p>
            <p className="mt-1 max-w-sm text-sm text-fg-muted">
              You&apos;re about to begin your verifier application. You can save your progress
              and exit at any point along the way.
            </p>
          </div>
          <Link
            className="inline-flex h-10 items-center rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700"
            href="/vendor/application?start=1"
          >
            Start application
          </Link>
        </section>
      </div>
    );
  }

  const showWizard =
    !application ||
    application.status === "DRAFT" ||
    application.status === "REJECTED" ||
    application.status === "REVOKED";

  if (showWizard) {
    const requestedStep = Number(step);
    const validRequestedStep =
      Number.isInteger(requestedStep) && requestedStep >= 1 && requestedStep <= TOTAL_STEPS
        ? requestedStep
        : null;

    let initialStep: number;
    let initialUnlockedStep: number;
    if (application?.status === "DRAFT") {
      initialUnlockedStep = computeDraftProgress(application);
      initialStep = Math.min(validRequestedStep ?? initialUnlockedStep, initialUnlockedStep);
    } else {
      initialUnlockedStep = 1;
      initialStep = 1;
    }

    const initialData: DraftApplicationData = {
      companyName: application?.snapshotCompanyName ?? "",
      companyRegistrationNumber: application?.companyRegistrationNumber ?? "",
      serviceCategory: application?.snapshotServiceCategory ?? "",
      website: application?.snapshotWebsite ?? "",
      tradingName: application?.tradingName ?? "",
      organisationType: application?.organisationType ?? "",
      physicalAddress: application?.physicalAddress ?? "",
      postalAddress: application?.postalAddress ?? "",
      yearOfIncorporation: application?.yearOfIncorporation?.toString() ?? "",
      city: application?.city ?? "",
      country: application?.country ?? "",
      operatesInMultipleCountries: application?.operatesInMultipleCountries ?? false,
      operatingCountries: application?.operatingCountries ?? [],
      contactPersonName: application?.snapshotContactPersonName ?? "",
      contactEmail: application?.snapshotContactEmail ?? "",
      contactJobTitle: application?.contactJobTitle ?? "",
      contactPhone: application?.contactPhone ?? "",
      contactEmployeeNumber: application?.contactEmployeeNumber ?? "",
      preferredContactMethod: application?.preferredContactMethod ?? "",
      verificationReasons: application?.verificationReasons ?? [],
      otherVerificationReason: application?.otherVerificationReason ?? "",
      additionalInfo: application?.additionalInfo ?? "",

      docRegistrationCertificate: application?.docRegistrationCertificate ?? null,
      docProofOfAddress: application?.docProofOfAddress ?? null,
      docRepresentativeId: application?.docRepresentativeId ?? null,
      docLetterOfAuthorisation: application?.docLetterOfAuthorisation ?? null,
      docTaxCompliance: application?.docTaxCompliance ?? null,
      docBusinessLicence: application?.docBusinessLicence ?? null,
      declarationAccepted: application?.declarationAccepted ?? false,
    };

    const initialFilenames: Record<string, string> = {};
    for (const key of DOCUMENT_FIELD_KEYS) {
      const path = initialData[key];
      if (path) initialFilenames[key] = filenameFromStoragePath(path);
    }

    return (
      <div className="space-y-6">
        {previousDecision ? (
          <section className="overflow-hidden rounded-xl border border-danger-border bg-surface shadow-md">
            <div className="flex items-center gap-3 border-b border-danger-border bg-danger-bg px-5 py-3.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-danger-fg">
                <Info className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-fg">
                    {previousDecision.status === "REJECTED"
                      ? "Your previous application was not approved"
                      : "Your verifier access was revoked"}
                  </p>
                  <Badge tone="danger">
                    {previousDecision.status === "REJECTED" ? "Declined" : "Revoked"}
                  </Badge>
                </div>
                <p className="text-xs text-danger-fg">
                  {formatDateTime(
                    (
                      (previousDecision.status === "REJECTED"
                        ? previousDecision.reviewedAt
                        : previousDecision.revokedAt) ?? previousDecision.updatedAt
                    ).toISOString(),
                  )}
                </p>
              </div>
            </div>

            <div className="px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                Reason given
              </p>
              <blockquote className="mt-2 border-l-2 border-danger-border pl-3 text-sm leading-6 text-fg-muted">
                {(previousDecision.status === "REJECTED"
                  ? previousDecision.reviewNotes
                  : previousDecision.revokedNotes) ?? "No reason was provided."}
              </blockquote>

              <p className="mt-4 text-xs text-fg-subtle">
                Your previous details, including uploaded documents, have been carried over below —
                update anything that needs to change before resubmitting.
              </p>
            </div>
          </section>
        ) : null}
        <VendorApplicationWizard
          initialStep={initialStep}
          initialUnlockedStep={initialUnlockedStep}
          initialApplicationId={application?.status === "DRAFT" ? application.id : null}
          initialData={initialData}
          initialFilenames={initialFilenames}
        />
        <VendorApplicationHistory applications={history} />
      </div>
    );
  }

  const [documentUrls, logoUrl] = await Promise.all([
    (async () => {
      const urls: Record<string, string> = {};
      await Promise.all(
        DOCUMENT_FIELD_KEYS.map(async (key) => {
          const path = application[key];
          if (!path) return;
          const url = await getDocumentSignedUrl(path);
          if (url) urls[key] = url;
        }),
      );
      return urls;
    })(),
    application.vendorProfile.logoPath
      ? getDocumentSignedUrl(application.vendorProfile.logoPath)
      : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <VendorApplicationSummary
        companyName={application.snapshotCompanyName ?? application.vendorProfile.companyName}
        logoUrl={logoUrl}
        status={application.status as "PENDING" | "APPROVED"}
        createdAt={application.createdAt}
        decidedAt={application.reviewedAt}
      >
        <VendorApplicationDetails application={application} documentUrls={documentUrls} variant="embedded" />
      </VendorApplicationSummary>
      <VendorApplicationHistory applications={history} />
    </div>
  );
}
