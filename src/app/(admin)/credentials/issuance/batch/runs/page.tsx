/**
 * @fileoverview Renders the authenticated administrator page at `/credentials/issuance/batch/runs`.
 * @module app/(admin)/credentials/issuance/batch/runs/page
 */

import { SectionHeader } from "@/components/layout/SectionHeader";
import { BackButton } from "@/components/ui/BackButton";
import { BatchRunsTable } from "@/features/credentials/BatchRunsTable";
import { requireRole } from "@/lib/auth/session";
import { listBatchRuns } from "@/lib/issuance/batchRuns";

export default async function BatchRunsPage() {
  await requireRole(["SUPER_ADMIN", "ADMIN", "ISSUER"]);

  const runs = await listBatchRuns();

  return (
    <div className="space-y-6">
      <BackButton href="/credentials/issuance/batch" label="Back to batch issuance" />
      <SectionHeader title="Batch runs" description="Past batch issuance runs and delivery outcomes." />
      <BatchRunsTable runs={runs} />
    </div>
  );
}
