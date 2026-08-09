import { notFound } from "next/navigation";

import { SectionHeader } from "@/components/layout/SectionHeader";
import { BackButton } from "@/components/ui/BackButton";
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
      <BackButton href="/credentials/issuance/batch/runs" label="Back to runs" />
      <SectionHeader title="Batch run detail" description="Per-student status, failures, and retry controls." />
      <BatchRunDetailView initialRun={run} />
    </div>
  );
}
