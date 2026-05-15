import Link from "next/link";

import { SectionHeader } from "@/components/layout/SectionHeader";
import { BatchRunsTable } from "@/features/credentials/BatchRunsTable";
import { requireRole } from "@/lib/auth/session";
import { listBatchRuns } from "@/lib/issuance/batchRuns";

export default async function BatchRunsPage() {
  await requireRole(["SUPER_ADMIN", "ADMIN", "ISSUER"]);

  const runs = await listBatchRuns();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionHeader title="Batch runs" description="Past batch issuance runs and delivery outcomes." />
        <Link
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          href="/credentials/issuance/batch"
        >
          New batch
        </Link>
      </div>
      <BatchRunsTable runs={runs} />
    </div>
  );
}
