import { SectionHeader } from "@/components/layout/SectionHeader";
import { Badge } from "@/components/ui/Badge";
import { requireVendorSession } from "@/lib/auth/session";
import { getVendorApplicationForUser } from "@/lib/vendors/applications";
import { VendorApplicationForm } from "./VendorApplicationForm";

const STATUS_TONE = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  REVOKED: "warning",
} as const;

export default async function VendorApplicationPage() {
  const session = await requireVendorSession();
  const application = await getVendorApplicationForUser(session.user.id);

  const canApply =
    !application ||
    application.status === "REJECTED" ||
    application.status === "REVOKED";

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Verifier application"
        description="Apply to become an approved credential verifier."
      />

      {application ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-zinc-950">Latest application</h2>
            <Badge tone={STATUS_TONE[application.status]}>{application.status}</Badge>
          </div>
          <p className="mt-2 text-sm text-zinc-600">{application.justification}</p>

          {application.status === "REJECTED" && application.reviewNotes && (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3">
              <p className="text-xs font-medium text-red-700">Reason for rejection</p>
              <p className="mt-1 text-sm text-red-600">{application.reviewNotes}</p>
            </div>
          )}

          {application.status === "REVOKED" && application.revokedNotes && (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-medium text-amber-700">Reason for revocation</p>
              <p className="mt-1 text-sm text-amber-600">{application.revokedNotes}</p>
            </div>
          )}
        </section>
      ) : null}

      {canApply ? <VendorApplicationForm /> : null}
    </div>
  );
}
