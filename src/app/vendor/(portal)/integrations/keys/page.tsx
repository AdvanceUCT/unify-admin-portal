import { IntegrationKeysContent } from "@/features/vendors/integrations/ApiKeySettings";
import { requireVendorOwnerContextForRender } from "@/lib/vendors/context";
export default async function KeysPage({ searchParams }: { searchParams: Promise<{ preset?: string; returnTo?: string }> }) {
  const { context } = await requireVendorOwnerContextForRender();
  const [{ integrationOverview }, { listVendorApiCredentials }, query] = await Promise.all([import("@/lib/vendors/integrationOverview"), import("@/lib/vendors/integrations"), searchParams]);
  const [overview, keys] = await Promise.all([integrationOverview(context.vendorProfileId), listVendorApiCredentials(context.vendorProfileId)]);
  return <IntegrationKeysContent branches={overview.branches} initialApiKeys={keys.map(key => ({ ...key, createdAt: key.createdAt.toISOString(), lastUsedAt: key.lastUsedAt?.toISOString() ?? null, revokedAt: key.revokedAt?.toISOString() ?? null }))} preset={query.preset === "payments" ? "payments" : "verification"} returnTo={query.returnTo === "verification" || query.returnTo === "payments" ? query.returnTo : undefined} />;
}
