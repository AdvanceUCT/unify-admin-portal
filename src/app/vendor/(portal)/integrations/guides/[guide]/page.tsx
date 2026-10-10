import { notFound } from "next/navigation";
import { env } from "@/lib/config/env";
import { requireVendorOwnerContextForRender } from "@/lib/vendors/context";
import { integrationOverview } from "@/lib/vendors/integrationOverview";
import { IntegrationDocs, type GuideKind } from "@/features/vendors/integrations/IntegrationDocs";
export default async function GuidePage({ params }: { params: Promise<{ guide: string }> }) {
  const { guide } = await params;
  if (!["verification", "payments", "refunds"].includes(guide)) notFound();
  const { context } = await requireVendorOwnerContextForRender();
  const overview = await integrationOverview(context.vendorProfileId);
  return <IntegrationDocs baseUrl={env.APP_URL} branches={overview.branches} guide={guide as GuideKind} />;
}
