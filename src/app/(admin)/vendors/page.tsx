import Link from "next/link";

import { SectionHeader } from "@/components/layout/SectionHeader";
import { Badge } from "@/components/ui/Badge";
import { requireRole } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/formatters";
import { listVendorApplications } from "@/lib/vendors/applications";
import {
  approveVendorApplicationAction,
  rejectVendorApplicationAction,
  revokeVendorApplicationAction,
} from "./actions";

type Tab = "applications" | "approved" | "closed";

const TABS: { id: Tab; label: string }[] = [
  { id: "applications", label: "Applications" },
  { id: "approved", label: "Active Vendors" },
  { id: "closed", label: "Closed" },
];

function parseTab(value: string | string[] | undefined): Tab {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "approved" || raw === "closed") return raw;
  return "applications";
}

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  await requireRole(["SUPER_ADMIN", "ADMIN"]);

  const { tab: rawTab } = await searchParams;
  const activeTab = parseTab(rawTab);

  const [pending, approved, closed] = await Promise.all([
    listVendorApplications({ status: "PENDING" }),
    listVendorApplications({ status: "APPROVED" }),
    listVendorApplications({ status: ["REJECTED", "REVOKED"] }),
  ]);

  const counts: Record<Tab, number> = {
    applications: pending.length,
    approved: approved.length,
    closed: closed.length,
  };

  const newCount = pending.filter((a) => !a.viewedByAdminAt).length;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Vendors"
        description="Manage verifier applications and active vendor access."
      />

      <nav aria-label="Vendor sections" className="flex gap-2 border-b border-zinc-200">
        {TABS.map(({ id, label }) => {
          const isActive = activeTab === id;
          const count = counts[id];
          const showNew = id === "applications" && newCount > 0;
          return (
            <Link
              key={id}
              href={id === "applications" ? "/vendors" : `/vendors?tab=${id}`}
              aria-current={isActive ? "page" : undefined}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition ${
                isActive
                  ? "border-zinc-950 text-zinc-950"
                  : "border-transparent text-zinc-500 hover:text-zinc-950"
              }`}
            >
              {label}
              {count > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${
                    isActive ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600"
                  }`}
                >
                  {count}
                </span>
              )}
              {showNew && (
                <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-xs font-medium text-white">
                  {newCount} new
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {activeTab === "applications" && (
        <section className="rounded-lg border border-zinc-200 bg-white">
          <div className="divide-y divide-zinc-100">
            {pending.map((application) => {
              const isNew = !application.viewedByAdminAt;
              return (
                <div
                  key={application.id}
                  className="grid gap-4 px-5 py-4 md:grid-cols-[1fr_auto_auto]"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-medium text-zinc-950">
                        {application.vendorProfile.companyName}
                      </h2>
                      {isNew && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                          New
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-zinc-500">{application.vendorProfile.serviceCategory}</p>
                    <p className="mt-0.5 text-xs text-zinc-400">
                      Submitted {formatDateTime(application.createdAt.toISOString())}
                    </p>
                  </div>
                  <Badge tone="warning">PENDING</Badge>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/vendors/${application.id}`}
                      className="inline-flex h-9 items-center rounded-md border border-zinc-300 px-3 text-sm font-medium"
                    >
                      View
                    </Link>
                    <form action={approveVendorApplicationAction}>
                      <input type="hidden" name="applicationId" value={application.id} />
                      <button
                        type="submit"
                        className="h-9 rounded-md bg-zinc-900 px-3 text-sm font-medium text-white"
                      >
                        Approve
                      </button>
                    </form>
                    <form action={rejectVendorApplicationAction}>
                      <input type="hidden" name="applicationId" value={application.id} />
                      <button
                        type="submit"
                        className="h-9 rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-700"
                      >
                        Reject
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
            {pending.length === 0 && (
              <p className="px-5 py-6 text-sm text-zinc-500">No pending applications.</p>
            )}
          </div>
        </section>
      )}

      {activeTab === "approved" && (
        <section className="rounded-lg border border-zinc-200 bg-white">
          <div className="divide-y divide-zinc-100">
            {approved.map((application) => (
              <div
                key={application.id}
                className="grid gap-4 px-5 py-4 md:grid-cols-[1fr_auto_auto]"
              >
                <div>
                  <h2 className="font-medium text-zinc-950">
                    {application.vendorProfile.companyName}
                  </h2>
                  <p className="text-sm text-zinc-500">{application.vendorProfile.serviceCategory}</p>
                  <p className="text-xs text-zinc-400">{application.vendorProfile.contactEmail}</p>
                  {application.reviewedAt && (
                    <p className="mt-0.5 text-xs text-zinc-400">
                      Approved {formatDateTime(application.reviewedAt.toISOString())}
                    </p>
                  )}
                </div>
                <Badge tone="success">APPROVED</Badge>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/vendors/${application.id}`}
                    className="inline-flex h-9 items-center rounded-md border border-zinc-300 px-3 text-sm font-medium"
                  >
                    View
                  </Link>
                  <form action={revokeVendorApplicationAction}>
                    <input type="hidden" name="applicationId" value={application.id} />
                    <button
                      type="submit"
                      className="h-9 rounded-md border border-rose-200 px-3 text-sm font-medium text-rose-700 hover:bg-rose-50"
                    >
                      Revoke
                    </button>
                  </form>
                </div>
              </div>
            ))}
            {approved.length === 0 && (
              <p className="px-5 py-6 text-sm text-zinc-500">No active vendors.</p>
            )}
          </div>
        </section>
      )}

      {activeTab === "closed" && (
        <section className="rounded-lg border border-zinc-200 bg-white">
          <div className="divide-y divide-zinc-100">
            {closed.map((application) => {
              const isRevoked = application.status === "REVOKED";
              return (
                <div
                  key={application.id}
                  className="grid gap-4 px-5 py-4 md:grid-cols-[1fr_auto_auto]"
                >
                  <div>
                    <h2 className="font-medium text-zinc-950">
                      {application.vendorProfile.companyName}
                    </h2>
                    <p className="text-sm text-zinc-500">{application.vendorProfile.serviceCategory}</p>
                    {isRevoked && application.revokedAt ? (
                      <p className="mt-0.5 text-xs text-zinc-400">
                        Revoked {formatDateTime(application.revokedAt.toISOString())}
                      </p>
                    ) : application.reviewedAt ? (
                      <p className="mt-0.5 text-xs text-zinc-400">
                        Rejected {formatDateTime(application.reviewedAt.toISOString())}
                      </p>
                    ) : null}
                    {application.reviewNotes && (
                      <p className="mt-1 text-xs text-zinc-500 italic">{application.reviewNotes}</p>
                    )}
                  </div>
                  <Badge tone="danger">{application.status}</Badge>
                  <Link
                    href={`/vendors/${application.id}`}
                    className="inline-flex h-9 items-center rounded-md border border-zinc-300 px-3 text-sm font-medium"
                  >
                    View
                  </Link>
                </div>
              );
            })}
            {closed.length === 0 && (
              <p className="px-5 py-6 text-sm text-zinc-500">No closed applications.</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
