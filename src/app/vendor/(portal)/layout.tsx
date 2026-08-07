import { Building2, ClipboardList, Gauge, KeyRound, Landmark, LifeBuoy, UserCog, Users } from "lucide-react";

import { PortalShell } from "@/components/layout/PortalShell";
import { LiveVerificationNotifications } from "@/features/vendors/LiveVerificationNotifications";
import { requireVendorSession } from "@/lib/auth/session";
import { getDocumentSignedUrl } from "@/lib/storage/supabase";
import { getApprovedVendorContextForUser } from "@/lib/vendors/context";
import { encodeLiveVerificationCursor } from "@/lib/vendors/liveVerifications";
import { getVendorProfileLogoPath } from "@/lib/vendors/profile";

const ownerNavItems = [
  { href: "/vendor", label: "Overview", icon: Gauge },
  { href: "/vendor/branches", label: "Branches", icon: Building2 },
  { href: "/vendor/staff", label: "Staff", icon: Users },
  { href: "/vendor/application", label: "Application", icon: ClipboardList },
  { href: "/vendor/profile", label: "Profile", icon: UserCog },
  { href: "/vendor/integrations", label: "Integrations", icon: KeyRound },
  { href: "/vendor/help", label: "Help", icon: LifeBuoy },
];

const staffNavItems = [
  { href: "/vendor", label: "Overview", icon: Gauge },
  { href: "/vendor/branches", label: "Branches", icon: Building2 },
  { href: "/vendor/help", label: "Help", icon: LifeBuoy },
];

export default async function VendorPortalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await requireVendorSession();
  const vendorContext = await getApprovedVendorContextForUser(session.user.id);
  const logoPath = vendorContext
    ? await getVendorProfileLogoPath(vendorContext.vendorProfileId)
    : null;
  const logoUrl = logoPath ? await getDocumentSignedUrl(logoPath) : null;

  return (
    <PortalShell
      context={vendorContext?.companyName ?? "Verifier onboarding"}
      logoUrl={logoUrl}
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
