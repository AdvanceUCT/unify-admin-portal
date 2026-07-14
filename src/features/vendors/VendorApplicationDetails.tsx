import { Badge } from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/formatters";

type DocumentUrls = Partial<Record<
  | "docRegistrationCertificate"
  | "docProofOfAddress"
  | "docRepresentativeId"
  | "docLetterOfAuthorisation"
  | "docTaxCompliance"
  | "docBusinessLicence",
  string
>>;

type VendorApplicationDetailsProps = {
  application: {
    id: string;
    status: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "REVOKED";
    companyRegistrationNumber: string | null;
    justification: string | null;
    createdAt: Date;
    updatedAt: Date;
    reviewedAt: Date | null;
    reviewNotes: string | null;
    reviewedByUserId: string | null;
    snapshotCompanyName: string | null;
    snapshotServiceCategory: string | null;
    snapshotContactEmail: string | null;
    snapshotContactPersonName: string | null;
    snapshotWebsite: string | null;
    snapshotDescription: string | null;
    tradingName: string | null;
    organisationType: string | null;
    physicalAddress: string | null;
    postalAddress: string | null;
    contactJobTitle: string | null;
    contactPhone: string | null;
    contactEmployeeNumber: string | null;
    preferredContactMethod: string | null;
    additionalInfo: string | null;
    docRegistrationCertificate: string | null;
    docProofOfAddress: string | null;
    docRepresentativeId: string | null;
    docLetterOfAuthorisation: string | null;
    docTaxCompliance: string | null;
    docBusinessLicence: string | null;
    declarationAccepted: boolean | null;
    declarationAcceptedAt: Date | null;
    vendorProfile: {
      companyName: string;
      serviceCategory: string;
      website: string | null;
      description: string | null;
      contactPersonName: string | null;
      contactEmail: string;
    };
  };
  documentUrls?: DocumentUrls;
};


const DOCUMENT_FIELDS: { key: keyof DocumentUrls; label: string }[] = [
  { key: "docRegistrationCertificate", label: "Registration certificate" },
  { key: "docProofOfAddress", label: "Proof of address" },
  { key: "docRepresentativeId", label: "Representative ID" },
  { key: "docLetterOfAuthorisation", label: "Letter of authorisation" },
  { key: "docTaxCompliance", label: "Tax compliance" },
  { key: "docBusinessLicence", label: "Business licence" },
];

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="font-medium text-zinc-900">{label}</dt>
      <dd className="whitespace-pre-line">{value}</dd>
    </div>
  );
}

export function VendorApplicationDetails({
  application,
  documentUrls,
}: VendorApplicationDetailsProps) {
  const companyName =
    application.snapshotCompanyName ?? application.vendorProfile.companyName;
  const serviceCategory =
    application.snapshotServiceCategory ?? application.vendorProfile.serviceCategory;
  const contactEmail =
    application.snapshotContactEmail ?? application.vendorProfile.contactEmail;
  const contactPersonName =
    application.snapshotContactPersonName ?? application.vendorProfile.contactPersonName;
  const website = application.snapshotWebsite ?? application.vendorProfile.website;

  const badgeTone =
    application.status === "APPROVED"
      ? ("success" as const)
      : application.status === "PENDING"
        ? ("warning" as const)
        : application.status === "DRAFT"
          ? ("neutral" as const)
          : ("danger" as const);

  return (
    <div className="space-y-6 rounded-lg border border-zinc-200 bg-white p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-950">Application details</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Full verifier application information, including timestamps.
          </p>
        </div>
        <Badge tone={badgeTone}>{application.status}</Badge>
      </div>

      {/* Organisation & metadata */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded-lg bg-zinc-50 p-4">
          <h3 className="text-sm font-semibold text-zinc-800">Organisation</h3>
          <dl className="grid gap-3 text-sm text-zinc-600">
            <DetailRow label="Company name" value={companyName} />
            <DetailRow label="Trading name" value={application.tradingName} />
            <DetailRow label="Registration number" value={application.companyRegistrationNumber} />
            <DetailRow label="Organisation type" value={application.organisationType} />
            <DetailRow label="Service category" value={serviceCategory} />
            <DetailRow label="Website" value={website} />
            <DetailRow label="Physical address" value={application.physicalAddress} />
            <DetailRow label="Postal address" value={application.postalAddress} />
          </dl>
        </div>

        <div className="space-y-4 rounded-lg bg-zinc-50 p-4">
          <h3 className="text-sm font-semibold text-zinc-800">Application metadata</h3>
          <dl className="grid gap-3 text-sm text-zinc-600">
            <div>
              <dt className="font-medium text-zinc-900">Created</dt>
              <dd>{formatDateTime(application.createdAt.toISOString())}</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-900">Last updated</dt>
              <dd>{formatDateTime(application.updatedAt.toISOString())}</dd>
            </div>
            {application.reviewedAt ? (
              <div>
                <dt className="font-medium text-zinc-900">Reviewed</dt>
                <dd>{formatDateTime(application.reviewedAt.toISOString())}</dd>
              </div>
            ) : null}
            {application.reviewedByUserId ? (
              <div>
                <dt className="font-medium text-zinc-900">Reviewed by</dt>
                <dd>{application.reviewedByUserId}</dd>
              </div>
            ) : null}
            {application.reviewNotes ? (
              <div>
                <dt className="font-medium text-zinc-900">Review notes</dt>
                <dd>{application.reviewNotes}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </div>

      {/* Authorised representative */}
      {(contactPersonName || application.contactJobTitle) && (
        <div className="rounded-lg bg-zinc-50 p-4">
          <h3 className="mb-3 text-sm font-semibold text-zinc-800">Authorised representative</h3>
          <dl className="grid gap-3 text-sm text-zinc-600 sm:grid-cols-2">
            <DetailRow label="Full name" value={contactPersonName} />
            <DetailRow label="Work email" value={contactEmail} />
            <DetailRow label="Job title" value={application.contactJobTitle} />
            <DetailRow label="Phone" value={application.contactPhone} />
            <DetailRow label="Employee number" value={application.contactEmployeeNumber} />
            <DetailRow
              label="Preferred contact"
              value={application.preferredContactMethod}
            />
          </dl>
        </div>
      )}

      {/* Verification requirements */}
      {(application.justification || application.snapshotDescription) && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <h3 className="mb-2 text-sm font-semibold text-zinc-800">Purpose for verification</h3>
            <p className="text-sm text-zinc-600 whitespace-pre-line">
              {application.justification ?? "Not provided"}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <h3 className="mb-2 text-sm font-semibold text-zinc-800">Intended use</h3>
            <p className="text-sm text-zinc-600 whitespace-pre-line">
              {application.snapshotDescription ??
                application.vendorProfile.description ??
                "Not provided"}
            </p>
          </div>
        </div>
      )}

      {application.additionalInfo && (
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-zinc-800">Additional information</h3>
          <p className="text-sm text-zinc-600 whitespace-pre-line">{application.additionalInfo}</p>
        </div>
      )}


      {/* Supporting documents */}
      {DOCUMENT_FIELDS.some((f) => application[f.key]) && (
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-zinc-800">Supporting documents</h3>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {DOCUMENT_FIELDS.map(({ key, label }) => {
              const path = application[key];
              if (!path) return null;
              const signedUrl = documentUrls?.[key];
              return (
                <div key={key}>
                  <dt className="font-medium text-zinc-900">{label}</dt>
                  <dd className="mt-0.5">
                    {signedUrl ? (
                      <a
                        className="text-zinc-700 underline underline-offset-2 hover:text-zinc-950"
                        href={signedUrl}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        Open
                      </a>
                    ) : (
                      <span className="text-emerald-600">Uploaded</span>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      )}

      {/* Declaration */}
      {application.declarationAccepted != null && (
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-zinc-800">Declaration</h3>
          <dl className="grid gap-2 text-sm text-zinc-600">
            <div>
              <dt className="font-medium text-zinc-900">Accepted</dt>
              <dd>{application.declarationAccepted ? "Yes" : "No"}</dd>
            </div>
            {application.declarationAcceptedAt && (
              <div>
                <dt className="font-medium text-zinc-900">Accepted at</dt>
                <dd>{formatDateTime(application.declarationAcceptedAt.toISOString())}</dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </div>
  );
}
