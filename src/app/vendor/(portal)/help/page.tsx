/**
 * @fileoverview Renders the approved vendor page at `/vendor/help`.
 * @module app/vendor/(portal)/help/page
 */

import { requireVendorSessionForRender } from "@/lib/auth/session";
import { getUniversityProfileForRender } from "@/lib/university/profile";

import { VendorHelpForm } from "./VendorHelpForm";

export default async function VendorHelpPage() {
  await requireVendorSessionForRender();
  const universityProfile = await getUniversityProfileForRender();

  return (
    <div className="space-y-6">
      <VendorHelpForm supportEmail={universityProfile?.contactEmail} />
    </div>
  );
}
