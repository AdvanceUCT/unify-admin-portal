import { SectionHeader } from "@/components/layout/SectionHeader";
import { requireVendorSession } from "@/lib/auth/session";
import { getUniversityProfile } from "@/lib/university/profile";

import { VendorHelpForm } from "./VendorHelpForm";

export default async function VendorHelpPage() {
  await requireVendorSession();
  const universityProfile = await getUniversityProfile();

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Help"
        description="Send a request to the university support team. Replies will continue through email."
      />
      <VendorHelpForm supportEmail={universityProfile?.contactEmail} />
    </div>
  );
}
