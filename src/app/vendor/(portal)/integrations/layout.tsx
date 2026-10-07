import { requireVendorOwnerContextForRender } from "@/lib/vendors/context";
import { IntegrationNav } from "@/features/vendors/integrations/IntegrationNav";
export default async function IntegrationLayout({ children }: { children: React.ReactNode }) {
  await requireVendorOwnerContextForRender();
  return <div className="min-w-0 space-y-6"><header><h1 className="text-page-title text-fg">Integrations</h1><p className="mt-1 text-sm text-fg-muted">Connect your website or till to UNIFY.</p></header><IntegrationNav />{children}</div>;
}
