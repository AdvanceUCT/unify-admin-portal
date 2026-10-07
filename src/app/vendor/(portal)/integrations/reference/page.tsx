import { env } from "@/lib/config/env";
import { requireVendorOwnerContextForRender } from "@/lib/vendors/context";
import { integrationOverview } from "@/lib/vendors/integrationOverview";
import { IntegrationDocs } from "@/features/vendors/integrations/IntegrationDocs";
export default async function ReferencePage() {
  const { context } = await requireVendorOwnerContextForRender();
  const overview = await integrationOverview(context.vendorProfileId);
  return <IntegrationDocs baseUrl={env.APP_URL} branches={overview.branches} />;
}
