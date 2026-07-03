import { Badge } from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/formatters";

type VendorApplicationDetailsProps = {
  application: {
    id: string;
    status: "PENDING" | "APPROVED" | "REJECTED" | "REVOKED";
    companyRegistrationNumber: string | null;
    justification: string;
    createdAt: Date;
    updatedAt: Date;
    reviewedAt: Date | null;
    reviewNotes: string | null;
    reviewedByUserId: string | null;
    revokedAt: Date | null;
    revokedNotes: string | null;
    revokedByUserId: string | null;
    snapshotCompanyName: string | null;
    snapshotServiceCategory: string | null;
    snapshotContactEmail: string | null;
    snapshotContactPersonName: string | null;
    snapshotWebsite: string | null;
    snapshotDescription: string | null;
    vendorProfile: {
      companyName: string;
      serviceCategory: string;
      website: string | null;
      description: string | null;
      contactPersonName: string | null;
      contactEmail: string;
    };
  };
};

export function VendorApplicationDetails({ application }: VendorApplicationDetailsProps) {
  const companyName = application.snapshotCompanyName ?? application.vendorProfile.companyName;
  const serviceCategory = application.snapshotServiceCategory ?? application.vendorProfile.serviceCategory;
  const website = application.snapshotWebsite ?? application.vendorProfile.website;
  const contactPersonName = application.snapshotContactPersonName ?? application.vendorProfile.contactPersonName;
  const contactEmail = application.snapshotContactEmail ?? application.vendorProfile.contactEmail;
  const description = application.snapshotDescription ?? application.vendorProfile.description;

  return (
    <div className="space-y-6 rounded-lg border border-zinc-200 bg-white p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-950">Application details</h2>
          <p className="mt-1 text-sm text-zinc-600">Full verifier application information, including timestamps.</p>
        </div>
        <Badge
          tone={
            application.status === "APPROVED"
              ? "success"
              : application.status === "PENDING"
                ? "warning"
                : "danger"
          }
        >
          {application.status}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4 rounded-lg bg-zinc-50 p-4">
          <h3 className="text-sm font-semibold text-zinc-800">Vendor profile</h3>
          <dl className="grid gap-3 text-sm text-zinc-600">
            <div>
              <dt className="font-medium text-zinc-900">Company</dt>
              <dd>{companyName}</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-900">Category</dt>
              <dd>{serviceCategory}</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-900">Website</dt>
              <dd>{website ?? "Not provided"}</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-900">Contact person</dt>
              <dd>{contactPersonName ?? "Not provided"}</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-900">Contact email</dt>
              <dd>{contactEmail}</dd>
            </div>
          </dl>
        </div>

        <div className="space-y-4 rounded-lg bg-zinc-50 p-4">
          <h3 className="text-sm font-semibold text-zinc-800">Application metadata</h3>
          <dl className="grid gap-3 text-sm text-zinc-600">
            <div>
              <dt className="font-medium text-zinc-900">Submitted</dt>
              <dd>{formatDateTime(application.createdAt.toISOString())}</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-900">Last updated</dt>
              <dd>{formatDateTime(application.updatedAt.toISOString())}</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-900">Registration number</dt>
              <dd>{application.companyRegistrationNumber ?? "Not provided"}</dd>
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
            {application.revokedAt ? (
              <div>
                <dt className="font-medium text-zinc-900">Revoked</dt>
                <dd>{formatDateTime(application.revokedAt.toISOString())}</dd>
              </div>
            ) : null}
            {application.revokedByUserId ? (
              <div>
                <dt className="font-medium text-zinc-900">Revoked by</dt>
                <dd>{application.revokedByUserId}</dd>
              </div>
            ) : null}
            {application.revokedNotes ? (
              <div>
                <dt className="font-medium text-zinc-900">Revocation reason</dt>
                <dd>{application.revokedNotes}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-zinc-800">Service description</h3>
          <p className="mt-2 whitespace-pre-line text-sm text-zinc-600">{description ?? "Not provided"}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-zinc-800">Why verification access is needed</h3>
          <p className="mt-2 text-sm text-zinc-600 whitespace-pre-line">{application.justification}</p>
          <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
            Approved vendors request all attributes in the active student credential schema.
          </div>
        </div>
      </div>
    </div>
  );
}
