import { VendorIntegrationSettings } from "@/features/vendors/VendorIntegrationSettings";
import { requireVendorOwnerContextForRender } from "@/lib/vendors/context";
import { integrationOverview } from "@/lib/vendors/integrationOverview";
import { listVendorApiCredentials } from "@/lib/vendors/integrations";
export default async function KeysPage({ searchParams }: { searchParams: Promise<{ preset?: string }> }) {
  const { context } = await requireVendorOwnerContextForRender();
  const [overview, keys, query] = await Promise.all([integrationOverview(context.vendorProfileId), listVendorApiCredentials(context.vendorProfileId), searchParams]);
  return <VendorIntegrationSettings key={query.preset ?? "verification"} branches={overview.branches} initialPreset={query.preset === "payments" ? "payments" : "verification"} initialApiKeys={keys.map(k => ({ ...k, createdAt: k.createdAt.toISOString(), lastUsedAt: k.lastUsedAt?.toISOString() ?? null, revokedAt: k.revokedAt?.toISOString() ?? null }))} />;
}
