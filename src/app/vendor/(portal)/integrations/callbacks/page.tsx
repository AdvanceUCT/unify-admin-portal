import { CallbackNav } from "@/features/vendors/integrations/CallbackNav";
import { requireVendorOwnerContextForRender } from "@/lib/vendors/context";
import { integrationOverview } from "@/lib/vendors/integrationOverview";
import { CallbackSettings } from "@/features/vendors/integrations/CallbackSettings";
export default async function CallbacksPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { context } = await requireVendorOwnerContextForRender();
  const [overview, query] = await Promise.all([integrationOverview(context.vendorProfileId), searchParams]);
  const kind = query.type === "payments" ? "payments" : "verification";
  return <div className="space-y-6"><CallbackNav kind={kind} /><CallbackSettings key={kind} kind={kind} branches={overview.branches} /></div>;
}
