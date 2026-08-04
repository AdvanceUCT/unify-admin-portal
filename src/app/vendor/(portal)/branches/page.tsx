import { Building2, ChevronRight, MapPin, Plus } from "lucide-react";
import Link from "next/link";

import { SectionHeader } from "@/components/layout/SectionHeader";
import { Badge } from "@/components/ui/Badge";
import { BranchCreateForm } from "@/features/vendors/BranchCreateForm";
import { prisma } from "@/lib/db/prisma";
import { requireApprovedVendorContext } from "@/lib/vendors/context";

export default async function VendorBranchesPage() {
  const { context } = await requireApprovedVendorContext();
  const branches = await prisma.vendorBranch.findMany({
    where: {
      vendorProfileId: context.vendorProfileId,
      ...(context.role === "STAFF" ? { id: { in: context.branchIds } } : {}),
    },
    include: { _count: { select: { memberships: true, verifications: true } } },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
  const vendor = await prisma.vendorProfile.findUnique({
    where: { id: context.vendorProfileId },
    select: { defaultBranchId: true },
  });

  return (
    <div className="space-y-6">
      <SectionHeader title="Branches" description="Manage each physical verification point separately." />

      {context.role === "OWNER" && (
        <section className="rounded-lg border border-zinc-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2">
            <Plus size={18} aria-hidden="true" />
            <h2 className="font-medium text-zinc-950">Add branch</h2>
          </div>
          <BranchCreateForm />
        </section>
      )}

      <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-5 py-4">
          <h2 className="font-medium text-zinc-950">Service points</h2>
        </div>
        <div className="divide-y divide-zinc-100">
          {branches.map((branch) => (
            <Link className="flex items-center gap-4 px-5 py-4 hover:bg-zinc-50" href={`/vendor/branches/${branch.id}`} key={branch.id}>
              <span className="grid size-10 shrink-0 place-items-center rounded-md bg-zinc-100 text-zinc-600">
                <Building2 size={19} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-zinc-950">{branch.name}</p>
                  {vendor?.defaultBranchId === branch.id && <Badge tone="neutral">Default</Badge>}
                  <Badge tone={branch.status === "ACTIVE" ? "success" : branch.status === "PROVISIONING_FAILED" ? "danger" : "warning"}>{branch.status.replaceAll("_", " ")}</Badge>
                </div>
                <p className="mt-1 flex items-center gap-1 text-sm text-zinc-500">
                  <MapPin size={13} aria-hidden="true" /> {branch.address || "No address supplied"}
                </p>
                <p className="mt-1 text-xs text-zinc-400">{branch._count.memberships} staff · {branch._count.verifications} verifications</p>
              </div>
              <ChevronRight className="text-zinc-400" size={18} aria-hidden="true" />
            </Link>
          ))}
          {branches.length === 0 && <p className="px-5 py-8 text-sm text-zinc-500">No branches are assigned to this account.</p>}
        </div>
      </section>
    </div>
  );
}
