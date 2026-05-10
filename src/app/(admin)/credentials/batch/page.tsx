import { SectionHeader } from "@/components/layout/SectionHeader";
import { BatchIssuancePanel } from "@/features/credentials/BatchIssuancePanel";
import { BatchResetButton } from "@/features/credentials/BatchResetButton";
import { BatchHistory } from "@/features/credentials/BatchHistory";
import { getBatchIssuancePreview } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";

export default async function BatchIssuePage() {
  await requireRole(["SUPER_ADMIN", "ADMIN", "ISSUER"]);
  const preview = await getBatchIssuancePreview();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SectionHeader
          title="Batch issue"
          description="Prepare simulated student VC issuance runs."
        />
        {process.env.NODE_ENV !== "production" && <BatchResetButton />}
      </div>
      <BatchIssuancePanel preview={preview} />
      <BatchHistory />
    </div>
  );
}