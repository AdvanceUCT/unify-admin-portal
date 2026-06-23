import { SectionHeader } from "@/components/layout/SectionHeader";
import { Badge } from "@/components/ui/Badge";
import { requireRole } from "@/lib/auth/session";
import { listVendorApplications } from "@/lib/vendors/applications";
import {
  approveVendorApplicationAction,
  rejectVendorApplicationAction,
} from "./actions";

const STATUS_TONE = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
} as const;

export default async function VendorsPage() {
  await requireRole(["SUPER_ADMIN", "ADMIN"]);

  const applications = await listVendorApplications();

  return (
    <div className="space-y-6">
      <SectionHeader title="Vendors" description="Verifier applications awaiting approval or already decided." />
      <section className="rounded-lg border border-zinc-200 bg-white">
        <div className="divide-y divide-zinc-100">
          {applications.map((application) => (
            <div className="grid gap-4 px-5 py-4 md:grid-cols-[1fr_auto_auto]" key={application.id}>
              <div>
                <h2 className="font-medium text-zinc-950">{application.vendorProfile.companyName}</h2>
                <p className="text-sm text-zinc-500">{application.vendorProfile.serviceCategory}</p>
                <p className="mt-1 text-sm text-zinc-600">{application.justification}</p>
              </div>
              <Badge tone={STATUS_TONE[application.status]}>{application.status}</Badge>
              {application.status === "PENDING" ? (
                <div className="flex gap-2">
                  <form action={approveVendorApplicationAction}>
                    <input type="hidden" name="applicationId" value={application.id} />
                    <button className="h-9 rounded-md border border-zinc-300 px-3 text-sm font-medium" type="submit">
                      Approve
                    </button>
                  </form>
                  <form action={rejectVendorApplicationAction}>
                    <input type="hidden" name="applicationId" value={application.id} />
                    <button className="h-9 rounded-md border border-zinc-300 px-3 text-sm font-medium" type="submit">
                      Reject
                    </button>
                  </form>
                </div>
              ) : null}
            </div>
          ))}
          {applications.length === 0 ? (
            <p className="px-5 py-6 text-sm text-zinc-500">No vendor applications yet.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
