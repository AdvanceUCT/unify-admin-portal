import { requireVendorOwnerContextForRender } from "@/lib/vendors/context";
import { IntegrationWorkflow } from "@/features/vendors/integrations/IntegrationWorkflow";
export default async function VendorIntegrationsPage() {
  const { context } = await requireVendorOwnerContextForRender();
  const [{ integrationOverview }, { env }] = await Promise.all([import("@/lib/vendors/integrationOverview"), import("@/lib/config/env")]);
  return <IntegrationWorkflow kind="verification" state={await integrationOverview(context.vendorProfileId)} baseUrl={env.APP_URL} />;
}
