import Link from "next/link";
import { requireVendorOwnerContextForRender } from "@/lib/vendors/context";
import { integrationOverview } from "@/lib/vendors/integrationOverview";
import { CallbackSettings } from "@/features/vendors/integrations/CallbackSettings";
export default async function CallbacksPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { context } = await requireVendorOwnerContextForRender();
  const [overview, query] = await Promise.all([integrationOverview(context.vendorProfileId), searchParams]);
  const kind = query.type === "payments" ? "payments" : "verification";
  return <div className="space-y-6"><nav aria-label="Callback type" className="flex flex-wrap gap-4 text-sm">{(["verification", "payments"] as const).map(type => <Link key={type} href={`/vendor/integrations/callbacks?type=${type}`} aria-current={kind === type ? "page" : undefined} className={kind === type ? "font-medium text-brand-600 underline" : "text-fg-muted underline"}>{type === "verification" ? "Verification results" : "Payment and refund events"}</Link>)}</nav><CallbackSettings key={kind} kind={kind} branches={overview.branches} /></div>;
}
