import { VendorIntegrationSettings } from "@/features/vendors/VendorIntegrationSettings";
import { requireVendorOwnerContext } from "@/lib/vendors/context";
import { getVendorWebhookConfig, listVendorApiCredentials } from "@/lib/vendors/integrations";

export default async function VendorIntegrationsPage() {
  const { context } = await requireVendorOwnerContext();

  const [apiKeys, webhook] = await Promise.all([
    listVendorApiCredentials(context.vendorProfileId),
    getVendorWebhookConfig(context.vendorProfileId),
  ]);

  return (
    <div className="space-y-6">
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
