/**
 * @fileoverview Renders the approved vendor page at `/vendor/help`.
 * @module app/vendor/(portal)/help/page
 */

import { requireVendorSession } from "@/lib/auth/session";
import { getUniversityProfile } from "@/lib/university/profile";

import { VendorHelpForm } from "./VendorHelpForm";

export default async function VendorHelpPage() {
  await requireVendorSession();
  const universityProfile = await getUniversityProfile();

  return (
    <div className="space-y-6">
      <VendorHelpForm supportEmail={universityProfile?.contactEmail} />
    </div>
  );
}
