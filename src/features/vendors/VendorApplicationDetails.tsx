/**
 * @fileoverview Presents a submitted vendor application for administrator review.
 * @module features/vendors/VendorApplicationDetails
 */

import { Badge } from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/formatters";
import { filenameFromStoragePath } from "@/lib/storage/supabase";
import { formatVerificationReasons } from "@/lib/vendors/verification-reasons";

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
    verificationReasons: string[];
    otherVerificationReason: string | null;
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
      <dt className="font-medium text-fg">{label}</dt>
      <dd className="whitespace-pre-line">{value}</dd>
    </div>
  );
}

export function VendorApplicationDetails({
  application,
  documentUrls,
  variant = "standalone",
}: VendorApplicationDetailsProps & {
  /**
   * "embedded" drops the outer card and the "Application details" header +
   * status badge — used when a caller (the vendor application page's
   * collapsible summary) already provides both, so this doesn't render as a
   * redundant card-within-a-card.
   */
  variant?: "embedded" | "standalone";
}) {
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

  const content = (
    <>
      {/* Organisation & metadata */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded-lg bg-surface-muted p-4">
          <h3 className="text-sm font-semibold text-fg">Organisation</h3>
          <dl className="grid gap-3 text-sm text-fg-muted">
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

        <div className="space-y-4 rounded-lg bg-surface-muted p-4">
          <h3 className="text-sm font-semibold text-fg">Application metadata</h3>
          <dl className="grid gap-3 text-sm text-fg-muted">
            <div>
              <dt className="font-medium text-fg">Created</dt>
              <dd>{formatDateTime(application.createdAt.toISOString())}</dd>
            </div>
            <div>
              <dt className="font-medium text-fg">Last updated</dt>
              <dd>{formatDateTime(application.updatedAt.toISOString())}</dd>
            </div>
            {application.reviewedAt ? (
              <div>
                <dt className="font-medium text-fg">Reviewed</dt>
                <dd>{formatDateTime(application.reviewedAt.toISOString())}</dd>
              </div>
            ) : null}
            {application.reviewedByUserId ? (
              <div>
                <dt className="font-medium text-fg">Reviewed by</dt>
                <dd>{application.reviewedByUserId}</dd>
              </div>
            ) : null}
            {application.reviewNotes ? (
              <div>
                <dt className="font-medium text-fg">Review notes</dt>
                <dd>{application.reviewNotes}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </div>

      {/* Authorised representative */}
      {(contactPersonName || application.contactJobTitle) && (
        <div className="rounded-lg bg-surface-muted p-4">
          <h3 className="mb-3 text-sm font-semibold text-fg">Authorised representative</h3>
          <dl className="grid gap-3 text-sm text-fg-muted sm:grid-cols-2">
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
      {application.verificationReasons.length > 0 && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <h3 className="mb-2 text-sm font-semibold text-fg">Reasons for verification</h3>
          <p className="whitespace-pre-line text-sm text-fg-muted">
            {formatVerificationReasons(application.verificationReasons, application.otherVerificationReason)}
          </p>
        </div>
      )}

      {application.additionalInfo && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <h3 className="mb-2 text-sm font-semibold text-fg">Additional information</h3>
          <p className="whitespace-pre-line text-sm text-fg-muted">{application.additionalInfo}</p>
        </div>
      )}


      {/* Supporting documents */}
      {DOCUMENT_FIELDS.some((f) => application[f.key]) && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-fg">Supporting documents</h3>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {DOCUMENT_FIELDS.map(({ key, label }) => {
              const path = application[key];
              if (!path) return null;
              const signedUrl = documentUrls?.[key];
              const filename = filenameFromStoragePath(path);
              return (
                <div key={key} className="min-w-0">
                  <dt className="font-medium text-fg">{label}</dt>
                  <dd className="mt-0.5 min-w-0">
                    {signedUrl ? (
                      <a
                        className="block truncate text-fg-muted underline underline-offset-2 hover:text-fg"
                        href={signedUrl}
                        rel="noopener noreferrer"
                        target="_blank"
                        title={filename}
                      >
                        {filename}
                      </a>
                    ) : (
                      <span className="block truncate text-success-fg" title={filename || "Uploaded"}>
                        {filename || "Uploaded"}
                      </span>
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
        <div className="rounded-lg border border-border bg-surface p-4">
          <h3 className="mb-2 text-sm font-semibold text-fg">Declaration</h3>
          <dl className="grid gap-2 text-sm text-fg-muted">
            <div>
              <dt className="font-medium text-fg">Accepted</dt>
              <dd>{application.declarationAccepted ? "Yes" : "No"}</dd>
            </div>
            {application.declarationAcceptedAt && (
              <div>
                <dt className="font-medium text-fg">Accepted at</dt>
                <dd>{formatDateTime(application.declarationAcceptedAt.toISOString())}</dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </>
  );

  if (variant === "embedded") {
    return <div className="space-y-6">{content}</div>;
  }

  return (
    <div className="space-y-6 rounded-xl border border-border bg-surface p-6 shadow-md">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-section-title text-fg">Application details</h2>
          <p className="mt-1 text-sm text-fg-muted">
            Full verifier application information, including timestamps.
          </p>
        </div>
        <Badge tone={badgeTone}>{application.status}</Badge>
      </div>
      {content}
    </div>
  );
}
