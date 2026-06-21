import { ClipboardList, Gauge, Landmark, UserCog } from "lucide-react";

import { PortalShell } from "@/components/layout/PortalShell";
import { requireVendorSession } from "@/lib/auth/session";

const navItems = [
  { href: "/vendor", label: "Overview", icon: Gauge },
  { href: "/vendor/application", label: "Application", icon: ClipboardList },
  { href: "/vendor/profile", label: "Profile", icon: UserCog },
];

export default async function VendorPortalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await requireVendorSession();

  return (
    <PortalShell
      context="Verifier onboarding"
      navItems={navItems}
      productName="UNIFY Vendor"
      sessionLabel={session.user.name}
      signOutRedirectTo="/vendor/sign-in"
      utilityIcon={Landmark}
    >
      {children}
    </PortalShell>
  );
}
