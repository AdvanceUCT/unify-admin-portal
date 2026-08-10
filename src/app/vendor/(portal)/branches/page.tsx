/**
 * @fileoverview Renders the approved vendor page at `/vendor/branches`.
 * @module app/vendor/(portal)/branches/page
 */

import { Building2, ChevronRight, MapPin, Plus } from "lucide-react";
import Link from "next/link";

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
      {context.role === "OWNER" ? (
        <section className="rounded-xl border border-border bg-surface p-5 shadow-md">
          <div className="mb-4 flex items-center gap-2">
            <Plus className="text-brand-700" size={18} aria-hidden="true" />
            <h2 className="text-section-title text-fg">Add branch</h2>
          </div>
          <BranchCreateForm />
        </section>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-section-title text-fg">Service points</h2>
        </div>
        <div className="divide-y divide-border">
          {branches.map((branch) => (
            <Link
              className="flex items-center gap-4 px-5 py-4 transition hover:bg-surface-muted/60"
              href={`/vendor/branches/${branch.id}`}
              key={branch.id}
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-md bg-brand-50 text-brand-700">
                <Building2 size={19} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-fg">{branch.name}</p>
                  {vendor?.defaultBranchId === branch.id ? (
                    <Badge tone="neutral">Default</Badge>
                  ) : null}
                  <Badge
                    tone={
                      branch.status === "ACTIVE"
                        ? "success"
                        : branch.status === "PROVISIONING_FAILED"
                          ? "danger"
                          : "warning"
                    }
                  >
                    {branch.status.replaceAll("_", " ")}
                  </Badge>
                </div>
                <p className="mt-1 flex items-center gap-1 text-sm text-fg-muted">
                  <MapPin size={13} aria-hidden="true" />{" "}
                  {branch.address || "No address supplied"}
                </p>
                <p className="mt-1 text-xs text-fg-subtle">
                  {branch._count.memberships} staff /{" "}
                  {branch._count.verifications} verifications
                </p>
              </div>
              <ChevronRight
                className="text-fg-subtle"
                size={18}
                aria-hidden="true"
              />
            </Link>
          ))}
          {branches.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-fg-subtle">
              No branches are assigned to this account.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
