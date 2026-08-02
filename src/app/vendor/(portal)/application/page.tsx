import Link from "next/link";
import { AlertTriangle, ClipboardList } from "lucide-react";

import { SectionHeader } from "@/components/layout/SectionHeader";
import { VendorApplicationDetails } from "@/features/vendors/VendorApplicationDetails";
import { VendorApplicationHistory } from "@/features/vendors/VendorApplicationHistory";
import { TOTAL_STEPS, VendorApplicationWizard } from "@/features/vendors/application/VendorApplicationWizard";
import type { DraftApplicationData } from "@/features/vendors/application/VendorApplicationWizard";
import { requireVendorSession } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/formatters";
import { filenameFromStoragePath } from "@/lib/storage/supabase";
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
  const applications = await listVendorApplicationsForUser(session.user.id);
  const application = applications[0] ?? null;
  const history = applications.slice(1);
  const previousDecision =
    applications.find((a) => a.status === "REJECTED" || a.status === "REVOKED") ?? null;

  if (!application && start !== "1") {
    return (
      <div className="space-y-6">
        <SectionHeader
          title="Verifier application"
          description="Apply to become an approved credential verifier."
        />
        <section className="flex flex-col items-center gap-4 rounded-lg border border-zinc-200 bg-white p-10 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-zinc-100 text-zinc-500">
            <ClipboardList size={24} aria-hidden="true" />
          </span>
          <div>
            <p className="text-lg font-medium text-zinc-950">Start application?</p>
            <p className="mt-1 max-w-sm text-sm text-zinc-500">
              You&apos;re about to begin your verifier application. You can save your progress
              and exit at any point along the way.
            </p>
          </div>
          <Link
            className="inline-flex h-11 items-center rounded-md bg-zinc-950 px-6 text-sm font-medium text-white transition hover:bg-zinc-800"
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
    if (application?.status === "DRAFT") {
      const maxReachableStep = computeDraftProgress(application);
      initialStep = Math.min(validRequestedStep ?? maxReachableStep, maxReachableStep);
    } else {
      initialStep = validRequestedStep ?? 1;
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
      contactPersonName: application?.snapshotContactPersonName ?? "",
      contactEmail: application?.snapshotContactEmail ?? "",
      contactJobTitle: application?.contactJobTitle ?? "",
      contactPhone: application?.contactPhone ?? "",
      contactEmployeeNumber: application?.contactEmployeeNumber ?? "",
      preferredContactMethod: application?.preferredContactMethod ?? "",
      justification: application?.justification ?? "",
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
        <SectionHeader
          title="Verifier application"
          description="Complete all steps to apply for credential verification access."
        />
        {previousDecision ? (
          <div className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-medium">
                {previousDecision.status === "REJECTED"
                  ? "Your previous application was rejected"
                  : "Your verifier access was revoked"}
              </p>
              <p className="mt-0.5 text-rose-700">
                {(previousDecision.status === "REJECTED"
                  ? previousDecision.reviewNotes
                  : previousDecision.revokedNotes) ?? "No reason was provided."}
              </p>
              <p className="mt-1 text-xs text-rose-600">
                {formatDateTime(
                  (
                    (previousDecision.status === "REJECTED"
                      ? previousDecision.reviewedAt
                      : previousDecision.revokedAt) ?? previousDecision.updatedAt
                  ).toISOString(),
                )}
                {" · "}Your previous details, including uploaded documents, have been carried over
                below — update anything that needs to change before resubmitting.
              </p>
            </div>
          </div>
        ) : null}
        <VendorApplicationWizard
          initialStep={initialStep}
          initialApplicationId={application?.id ?? null}
          initialData={initialData}
          initialFilenames={initialFilenames}
        />
        <VendorApplicationHistory applications={history} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Verifier application"
        description="Apply to become an approved credential verifier."
      />
      <VendorApplicationDetails application={application} />
      <VendorApplicationHistory applications={history} />
    </div>
  );
}
