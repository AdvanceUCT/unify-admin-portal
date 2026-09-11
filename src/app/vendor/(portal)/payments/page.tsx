/**
 * @fileoverview Renders completed student wallet payments for an approved vendor.
 * @module app/vendor/(portal)/payments/page
 */

import Link from "next/link";

import { Badge } from "@/components/ui/Badge";
import { LivePaymentList } from "@/features/vendors/LivePaymentList";
import { prisma } from "@/lib/db/prisma";
import { requireApprovedVendorContextForRender } from "@/lib/vendors/context";
import { encodeLivePaymentCursor, listRecentVendorPayments } from "@/lib/vendors/livePayments";

export default async function VendorPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string }>;
}) {
  const { context } = await requireApprovedVendorContextForRender();
  const params = await searchParams;
  const branches = await prisma.vendorBranch.findMany({
    where: {
      vendorProfileId: context.vendorProfileId,
      id: { in: context.branchIds },
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const selectedBranchId = params.branchId && context.branchIds.includes(params.branchId)
    ? params.branchId
    : undefined;
  const selectedBranch = selectedBranchId
    ? branches.find((branch) => branch.id === selectedBranchId)
    : undefined;
  const payments = await listRecentVendorPayments(context, {
    branchIds: selectedBranchId ? [selectedBranchId] : undefined,
  });

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-surface p-5 shadow-md">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-page-title text-fg">Wallet payments</h1>
            <p className="mt-1 text-sm text-fg-subtle">
              Confirm student wallet payments before handing over goods or services.
            </p>
          </div>
          <Badge tone="success">Live polling</Badge>
        </div>
      </section>

      {branches.length > 1 ? (
        <section className="rounded-xl border border-border bg-surface p-4 shadow-md">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                !selectedBranchId ? "bg-brand-600 text-white" : "bg-surface-muted text-fg-muted hover:text-fg"
              }`}
              href="/vendor/payments"
            >
              All branches
            </Link>
            {branches.map((branch) => (
              <Link
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  selectedBranchId === branch.id ? "bg-brand-600 text-white" : "bg-surface-muted text-fg-muted hover:text-fg"
                }`}
                href={`/vendor/payments?branchId=${encodeURIComponent(branch.id)}`}
                key={branch.id}
              >
                {branch.name}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-section-title text-fg">Incoming payments</h2>
            <p className="mt-1 text-sm text-fg-subtle">
              {selectedBranch ? selectedBranch.name : "All permitted branches"}
            </p>
          </div>
          <span className="text-xs font-medium text-fg-subtle">Refreshes every few seconds</span>
        </div>
        <LivePaymentList
          branchId={selectedBranchId}
          initialItems={payments}
          liveCursor={encodeLivePaymentCursor({ completedAt: new Date().toISOString(), id: "_" })}
        />
      </section>
    </div>
  );
}
