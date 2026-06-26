import { Globe, Mail, User } from "lucide-react";

import { SectionHeader } from "@/components/layout/SectionHeader";
import { Badge } from "@/components/ui/Badge";
import { requireRole } from "@/lib/auth/session";
import { listVendorApplications } from "@/lib/vendors/applications";
import {
  approveVendorApplicationAction,
  rejectVendorApplicationAction,
} from "./actions";

const SCOPE_LABELS: Record<string, string> = {
  enrollment_status: "Enrollment Status",
  faculty: "Faculty",
  programme: "Programme",
  degree: "Degree",
  student_id: "Student ID",
};

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireRole(["SUPER_ADMIN", "ADMIN"]);

  const { tab } = await searchParams;
  const activeTab = tab === "applications" ? "applications" : "vendors";

  const [approvedApplications, pendingApplications, rejectedApplications] =
    await Promise.all([
      listVendorApplications({ status: "APPROVED" }),
      listVendorApplications({ status: "PENDING" }),
      listVendorApplications({ status: "REJECTED" }),
    ]);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Vendors"
        description="Manage onboarded service providers and review verifier applications."
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-200">
        <TabLink href="/vendors" active={activeTab === "vendors"}>
          Active Vendors
          {approvedApplications.length > 0 && (
            <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
              {approvedApplications.length}
            </span>
          )}
        </TabLink>
        <TabLink href="/vendors?tab=applications" active={activeTab === "applications"}>
          Applications
          {pendingApplications.length > 0 && (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              {pendingApplications.length}
            </span>
          )}
        </TabLink>
      </div>

      {/* Active Vendors tab */}
      {activeTab === "vendors" && (
        <section className="rounded-lg border border-zinc-200 bg-white">
          <div className="divide-y divide-zinc-100">
            {approvedApplications.map((application) => (
              <div key={application.id} className="px-5 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold text-zinc-950">
                        {application.vendorProfile.companyName}
                      </h2>
                      <Badge tone="success">Active</Badge>
                    </div>
                    <p className="mt-0.5 text-sm text-zinc-500">
                      {application.vendorProfile.serviceCategory}
                      {application.companyRegistrationNumber && (
                        <> &middot; Reg. {application.companyRegistrationNumber}</>
                      )}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-zinc-600">
                      {application.vendorProfile.contactPersonName && (
                        <span className="flex items-center gap-1.5">
                          <User className="size-3.5 shrink-0 text-zinc-400" />
                          {application.vendorProfile.contactPersonName}
                        </span>
                      )}
                      <span className="flex items-center gap-1.5">
                        <Mail className="size-3.5 shrink-0 text-zinc-400" />
                        {application.vendorProfile.contactEmail}
                      </span>
                      {application.vendorProfile.website && (
                        <span className="flex items-center gap-1.5">
                          <Globe className="size-3.5 shrink-0 text-zinc-400" />
                          <a
                            className="text-blue-600 hover:underline"
                            href={application.vendorProfile.website}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {application.vendorProfile.website.replace(/^https?:\/\//, "")}
                          </a>
                        </span>
                      )}
                    </div>

                    {application.requestedScopes.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {application.requestedScopes.map((scope) => (
                          <span
                            key={scope}
                            className="inline-flex items-center rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-600"
                          >
                            {SCOPE_LABELS[scope] ?? scope}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {application.reviewedAt && (
                    <p className="shrink-0 text-xs text-zinc-400">
                      Approved{" "}
                      {new Date(application.reviewedAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  )}
                </div>
              </div>
            ))}

            {approvedApplications.length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-zinc-500">
                No approved vendors yet. Approve a verifier application to onboard them.
              </p>
            )}
          </div>
        </section>
      )}

      {/* Applications tab */}
      {activeTab === "applications" && (
        <div className="space-y-6">
          {/* Pending */}
          <div>
            <h2 className="mb-3 text-sm font-medium text-zinc-500 uppercase tracking-wide">
              Pending ({pendingApplications.length})
            </h2>
            <section className="rounded-lg border border-zinc-200 bg-white">
              <div className="divide-y divide-zinc-100">
                {pendingApplications.map((application) => (
                  <div
                    key={application.id}
                    className="grid gap-4 px-5 py-4 md:grid-cols-[1fr_auto]"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-zinc-950">
                          {application.vendorProfile.companyName}
                        </h3>
                        <Badge tone="warning">Pending</Badge>
                      </div>
                      <p className="text-sm text-zinc-500">
                        {application.vendorProfile.serviceCategory}
                      </p>
                      <p className="mt-1 text-sm text-zinc-600">{application.justification}</p>
                      <p className="mt-1 text-xs text-zinc-400">
                        Submitted{" "}
                        {new Date(application.createdAt).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <form action={approveVendorApplicationAction}>
                        <input type="hidden" name="applicationId" value={application.id} />
                        <button
                          className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                          type="submit"
                        >
                          Approve
                        </button>
                      </form>
                      <form action={rejectVendorApplicationAction}>
                        <input type="hidden" name="applicationId" value={application.id} />
                        <button
                          className="h-9 rounded-md border border-rose-200 bg-rose-50 px-3 text-sm font-medium text-rose-700 hover:bg-rose-100"
                          type="submit"
                        >
                          Reject
                        </button>
                      </form>
                    </div>
                  </div>
                ))}
                {pendingApplications.length === 0 && (
                  <p className="px-5 py-6 text-sm text-zinc-500">No pending applications.</p>
                )}
              </div>
            </section>
          </div>

          {/* Rejected */}
          {rejectedApplications.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-medium text-zinc-500 uppercase tracking-wide">
                Rejected ({rejectedApplications.length})
              </h2>
              <section className="rounded-lg border border-zinc-200 bg-white">
                <div className="divide-y divide-zinc-100">
                  {rejectedApplications.map((application) => (
                    <div key={application.id} className="flex items-center gap-4 px-5 py-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-zinc-950">
                            {application.vendorProfile.companyName}
                          </h3>
                          <Badge tone="danger">Rejected</Badge>
                        </div>
                        <p className="text-sm text-zinc-500">
                          {application.vendorProfile.serviceCategory}
                        </p>
                        {application.reviewNotes && (
                          <p className="mt-1 text-sm text-zinc-600">
                            Note: {application.reviewNotes}
                          </p>
                        )}
                      </div>
                      {application.reviewedAt && (
                        <p className="shrink-0 text-xs text-zinc-400">
                          {new Date(application.reviewedAt).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className={`flex items-center px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active
          ? "border-zinc-900 text-zinc-900"
          : "border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300"
      }`}
    >
      {children}
    </a>
  );
}
