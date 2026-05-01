import { SectionHeader } from "@/components/layout/SectionHeader";
import { BatchIssuancePanel } from "@/features/credentials/BatchIssuancePanel";
import { getBatchIssuancePreview } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";

export default async function BatchIssuePage() {
  await requireRole(["SUPER_ADMIN", "ADMIN", "ISSUER"]);

  const preview = await getBatchIssuancePreview();

  return (
    <div className="space-y-6">
      <SectionHeader title="Batch issue" description="Prepare simulated student VC issuance runs." />
      <BatchIssuancePanel preview={preview} />
    </div>
  );
}
