import { ClipboardList, Gauge, Landmark, MapPin, UserCog } from "lucide-react";

import { PortalShell } from "@/components/layout/PortalShell";
import { requireVendorSession } from "@/lib/auth/session";
import { getVendorAccountContext } from "@/lib/vendors/account";

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
  const vendorContext = await getVendorAccountContext(session.user.id);
  const [overviewNavItem, applicationNavItem, profileNavItem] = navItems;
  const resolvedNavItems = vendorContext?.isSubVendor
    ? navItems.filter((item) => item.href !== "/vendor/application")
    : vendorContext?.isParent
      ? [
          overviewNavItem,
          { href: "/vendor/locations", label: "Locations", icon: MapPin },
          applicationNavItem,
          profileNavItem,
        ]
      : navItems;

  return (
    <PortalShell
      context={vendorContext?.isSubVendor ? "Verifier location" : "Verifier onboarding"}
      navItems={resolvedNavItems}
      productName="UNIFY Vendor"
      sessionLabel={session.user.name}
      signOutRedirectTo="/vendor/sign-in"
      utilityIcon={Landmark}
    >
      {children}
    </PortalShell>
  );
}
