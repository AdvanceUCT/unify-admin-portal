import { Building2, ClipboardList, Gauge, KeyRound, Landmark, UserCog, Users } from "lucide-react";

import { PortalShell } from "@/components/layout/PortalShell";
import { LiveVerificationNotifications } from "@/features/vendors/LiveVerificationNotifications";
import { requireVendorSession } from "@/lib/auth/session";
import { getApprovedVendorContextForUser } from "@/lib/vendors/context";
import { encodeLiveVerificationCursor } from "@/lib/vendors/liveVerifications";

const ownerNavItems = [
  { href: "/vendor", label: "Overview", icon: Gauge },
  { href: "/vendor/branches", label: "Branches", icon: Building2 },
  { href: "/vendor/staff", label: "Staff", icon: Users },
  { href: "/vendor/application", label: "Application", icon: ClipboardList },
  { href: "/vendor/profile", label: "Profile", icon: UserCog },
  { href: "/vendor/integrations", label: "Integrations", icon: KeyRound },
];

const staffNavItems = [
  { href: "/vendor", label: "Overview", icon: Gauge },
  { href: "/vendor/branches", label: "Branches", icon: Building2 },
];

export default async function VendorPortalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await requireVendorSession();
  const vendorContext = await getApprovedVendorContextForUser(session.user.id);

  return (
    <PortalShell
      context={vendorContext?.companyName ?? "Verifier onboarding"}
      navItems={vendorContext?.role === "STAFF" ? staffNavItems : ownerNavItems}
      productName="UNIFY Vendor"
      sessionLabel={session.user.name}
      signOutRedirectTo="/vendor/sign-in"
      utilityIcon={Landmark}
    >
      {vendorContext ? <LiveVerificationNotifications initialCursor={encodeLiveVerificationCursor({ completedAt: new Date().toISOString(), id: "_" })} /> : null}
      {children}
    </PortalShell>
  );
}
