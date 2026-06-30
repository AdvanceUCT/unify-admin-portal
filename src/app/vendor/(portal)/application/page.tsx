import { SectionHeader } from "@/components/layout/SectionHeader";
import { VendorApplicationDetails } from "@/components/vendors/VendorApplicationDetails";
import { requireVendorSession } from "@/lib/auth/session";
import { getVendorApplicationForUser } from "@/lib/vendors/applications";
import { VendorApplicationForm } from "./VendorApplicationForm";

export default async function VendorApplicationPage() {
  const session = await requireVendorSession();
  const application = await getVendorApplicationForUser(session.user.id);

  const canApply = !application || application.status === "REJECTED";

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Verifier application"
        description="Apply to become an approved credential verifier."
      />

      {application ? (
        <VendorApplicationDetails application={application} />
      ) : null}

      {canApply ? <VendorApplicationForm /> : null}
    </div>
  );
}
