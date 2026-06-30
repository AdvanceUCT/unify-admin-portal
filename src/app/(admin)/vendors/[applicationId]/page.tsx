import Link from "next/link";
import { notFound } from "next/navigation";

import { SectionHeader } from "@/components/layout/SectionHeader";
import { VendorApplicationDetails } from "@/components/vendors/VendorApplicationDetails";
import { requireRole } from "@/lib/auth/session";
import {
  getVendorApplicationById,
  markApplicationViewed,
} from "@/lib/vendors/applications";
import { revokeVendorApplicationAction } from "../actions";

export default async function VendorApplicationDetailPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  await requireRole(["SUPER_ADMIN", "ADMIN"]);
  const { applicationId } = await params;
  const application = await getVendorApplicationById(applicationId);

  if (!application) {
    notFound();
  }

  if (application.status === "PENDING" && !application.viewedByAdminAt) {
    await markApplicationViewed({ applicationId });
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Vendor application"
        description={`Details for ${application.vendorProfile.companyName}.`}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/vendors"
          className="text-sm text-zinc-500 hover:text-zinc-800"
        >
          ← Back to vendors
        </Link>
        {application.status === "APPROVED" && (
          <form action={revokeVendorApplicationAction}>
            <input type="hidden" name="applicationId" value={application.id} />
            <button
              type="submit"
              className="h-9 rounded-md border border-rose-200 px-3 text-sm font-medium text-rose-700 hover:bg-rose-50"
            >
              Revoke access
            </button>
          </form>
        )}
      </div>

      <VendorApplicationDetails application={application} />
    </div>
  );
}
