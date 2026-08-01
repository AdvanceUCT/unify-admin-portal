import Link from "next/link";
import { notFound } from "next/navigation";

import { SectionHeader } from "@/components/layout/SectionHeader";
import { VendorApplicationDetails } from "@/features/vendors/VendorApplicationDetails";
import { requireVendorSession } from "@/lib/auth/session";
import { getVendorApplicationByIdForUser } from "@/lib/vendors/applications";

export default async function VendorApplicationHistoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireVendorSession();
  const application = await getVendorApplicationByIdForUser(id, session.user.id);

  if (!application) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Previous application"
        description="Read-only record of a past verifier application submission."
      />
      <Link className="text-sm text-zinc-500 hover:text-zinc-800" href="/vendor/application">
        ← Back to application
      </Link>
      <VendorApplicationDetails application={application} />
    </div>
  );
}
