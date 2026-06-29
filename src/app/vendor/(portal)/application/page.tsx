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
        </section>
      ) : null}

      {canApply ? <VendorApplicationForm /> : null}
    </div>
  );
}
