import { requireVendorOwnerContextForRender } from "@/lib/vendors/context";
import { integrationOverview } from "@/lib/vendors/integrationOverview";
import { IntegrationOverview } from "@/features/vendors/integrations/IntegrationOverview";
export default async function VendorIntegrationsPage() {
  const { context } = await requireVendorOwnerContextForRender();
  const state = await integrationOverview(context.vendorProfileId);
  return <IntegrationOverview state={state} />;
}
