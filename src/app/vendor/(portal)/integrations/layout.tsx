import { requireVendorOwnerContextForRender } from "@/lib/vendors/context";
import { IntegrationRouteShell } from "@/features/vendors/integrations/IntegrationRouteShell";
export default async function IntegrationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireVendorOwnerContextForRender();
  return <IntegrationRouteShell>{children}</IntegrationRouteShell>;
}
