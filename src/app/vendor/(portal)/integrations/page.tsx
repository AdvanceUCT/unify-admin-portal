import { SectionHeader } from "@/components/layout/SectionHeader";
import { VendorIntegrationSettings } from "@/features/vendors/VendorIntegrationSettings";
import { requireApprovedVendorSession } from "@/lib/auth/session";
import { approvedVendorProfileForUser, getVendorWebhookConfig, listVendorApiCredentials } from "@/lib/vendors/integrations";

export default async function VendorIntegrationsPage() {
  const session = await requireApprovedVendorSession();
  const vendor = await approvedVendorProfileForUser(session.user.id);
  if (!vendor) return null;

  const [apiKeys, webhook] = await Promise.all([
    listVendorApiCredentials(vendor.id),
    getVendorWebhookConfig(vendor.id),
  ]);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Integrations"
        description="Manage checkout API access and verification result delivery."
      />
      <VendorIntegrationSettings
        initialApiKeys={apiKeys.map((key) => ({
          ...key,
          createdAt: key.createdAt.toISOString(),
          lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
          revokedAt: key.revokedAt?.toISOString() ?? null,
        }))}
        initialWebhook={webhook ? { url: webhook.url, enabled: webhook.enabled } : null}
      />
    </div>
  );
}
