import { SectionHeader } from "@/components/layout/SectionHeader";
import { getBatchIssuancePreview } from "@/lib/api/client";
import { BatchIssuancePanel } from "@/features/credentials/BatchIssuancePanel";

export default async function BatchIssuePage() {
  const preview = await getBatchIssuancePreview();

  return (
    <div className="space-y-6">
      <SectionHeader title="Batch issue" description="Prepare simulated student VC issuance runs." />
      <BatchIssuancePanel preview={preview} />
    </div>
  );
}
