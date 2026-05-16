import Link from "next/link";

import { SectionHeader } from "@/components/layout/SectionHeader";
import { BatchIssuancePanel } from "@/features/credentials/BatchIssuancePanel";
import { getBatchIssuancePreview } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";

export default async function BatchIssuePage() {
  await requireRole(["SUPER_ADMIN", "ADMIN", "ISSUER"]);

  const preview = await getBatchIssuancePreview();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionHeader title="Batch issue" description="Prepare simulated student VC issuance runs." />
        <Link
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          href="/credentials/issuance"
        >
          Back to issuance
        </Link>
      </div>
      <BatchIssuancePanel preview={preview} />
    </div>
  );
}
