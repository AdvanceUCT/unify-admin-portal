import Link from "next/link";
import { notFound } from "next/navigation";

import { SectionHeader } from "@/components/layout/SectionHeader";
import { BatchRunDetailView } from "@/features/credentials/BatchRunDetailView";
import { requireRole } from "@/lib/auth/session";
import { getBatchRunDetail } from "@/lib/issuance/batchRuns";

export default async function BatchRunDetailPage({ params }: { params: Promise<{ batchId: string }> }) {
  await requireRole(["SUPER_ADMIN", "ADMIN", "ISSUER"]);

  const { batchId } = await params;
  const run = await getBatchRunDetail(batchId).catch(() => undefined);

  if (!run) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionHeader title="Batch run detail" description="Per-student status, failures, and retry controls." />
        <Link
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          href="/credentials/issuance/batch/runs"
        >
          Back to runs
        </Link>
      </div>
      <BatchRunDetailView initialRun={run} />
    </div>
  );
}
