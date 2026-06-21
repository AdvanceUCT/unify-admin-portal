import Link from "next/link";

import { SectionHeader } from "@/components/layout/SectionHeader";
import { Badge } from "@/components/ui/Badge";
import { requireVendorSession } from "@/lib/auth/session";
import { getVendorApplicationForUser } from "@/lib/vendors/applications";

export default async function VendorDashboardPage() {
  const session = await requireVendorSession();
  const application = await getVendorApplicationForUser(session.user.id);

  return (
    <div className="space-y-6">
      <SectionHeader
        title={`Welcome, ${session.user.name}`}
        description="Track your verifier application and manage your vendor profile."
      />

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-zinc-950">Application status</h2>
          {application ? <Badge tone={application.status === "APPROVED" ? "success" : application.status === "REJECTED" ? "danger" : "warning"}>{application.status}</Badge> : null}
        </div>
        <p className="mt-2 text-sm text-zinc-600">
          {application
            ? "View your application details."
            : "You haven't submitted a verifier application yet."}
        </p>
        <Link
          className="mt-4 inline-flex h-9 items-center rounded-md border border-zinc-300 px-3 text-sm font-medium"
          href="/vendor/application"
        >
          {application ? "View application" : "Apply now"}
        </Link>
      </section>
    </div>
  );
}
