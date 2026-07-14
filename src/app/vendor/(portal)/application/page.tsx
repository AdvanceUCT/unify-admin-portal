import { SectionHeader } from "@/components/layout/SectionHeader";
import { VendorApplicationDetails } from "@/features/vendors/VendorApplicationDetails";
import { VendorApplicationWizard } from "@/features/vendors/application/VendorApplicationWizard";
import type { DraftApplicationData } from "@/features/vendors/application/VendorApplicationWizard";
import { requireVendorSession } from "@/lib/auth/session";
import {
  computeDraftProgress,
  getVendorApplicationForUser,
} from "@/lib/vendors/applications";

export default async function VendorApplicationPage() {
  const session = await requireVendorSession();
  const application = await getVendorApplicationForUser(session.user.id);

  const showWizard =
    !application ||
    application.status === "DRAFT" ||
    application.status === "REJECTED" ||
    application.status === "REVOKED";

  if (showWizard) {
    const initialStep = application?.status === "DRAFT" ? computeDraftProgress(application) : 1;

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
      description: application?.snapshotDescription ?? "",
      additionalInfo: application?.additionalInfo ?? "",
      requestedScopes: application?.requestedScopes ?? [],
      docRegistrationCertificate: application?.docRegistrationCertificate ?? null,
      docProofOfAddress: application?.docProofOfAddress ?? null,
      docRepresentativeId: application?.docRepresentativeId ?? null,
      docLetterOfAuthorisation: application?.docLetterOfAuthorisation ?? null,
      docTaxCompliance: application?.docTaxCompliance ?? null,
      docBusinessLicence: application?.docBusinessLicence ?? null,
      declarationAccepted: application?.declarationAccepted ?? false,
    };

    return (
      <div className="space-y-6">
        <SectionHeader
          title="Verifier application"
          description="Complete all steps to apply for credential verification access."
        />
        <VendorApplicationWizard
          initialStep={initialStep}
          initialApplicationId={application?.id ?? null}
          initialData={initialData}
        />
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
    </div>
  );
}
