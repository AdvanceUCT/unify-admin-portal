import { Building2, ClipboardList, Gauge, KeyRound, Landmark, LifeBuoy, ShieldCheck, UserCog, Users } from "lucide-react";

import { PortalShell } from "@/components/layout/PortalShell";
import { LiveVerificationNotifications } from "@/features/vendors/LiveVerificationNotifications";
import { requireVendorSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getDocumentSignedUrl } from "@/lib/storage/supabase";
import { getApprovedVendorContextForUser, type ApprovedVendorContext } from "@/lib/vendors/context";
import { encodeLiveVerificationCursor } from "@/lib/vendors/liveVerifications";
import { getVendorProfileLogoPath } from "@/lib/vendors/profile";

const ownerNavItems = [
  { href: "/vendor", label: "Overview", icon: Gauge },
  { href: "/vendor/verifications", label: "Verifications", icon: ShieldCheck },
  { href: "/vendor/branches", label: "Branches", icon: Building2 },
  { href: "/vendor/staff", label: "Staff", icon: Users },
  { href: "/vendor/application", label: "Application", icon: ClipboardList },
  { href: "/vendor/profile", label: "Profile", icon: UserCog },
  { href: "/vendor/integrations", label: "Integrations", icon: KeyRound },
  { href: "/vendor/help", label: "Help", icon: LifeBuoy },
];

const staffNavItems = [
  { href: "/vendor", label: "Overview", icon: Gauge },
  { href: "/vendor/verifications", label: "Verifications", icon: ShieldCheck },
  { href: "/vendor/branches", label: "Branches", icon: Building2 },
  { href: "/vendor/help", label: "Help", icon: LifeBuoy },
];

async function notificationBranchIdsFor(context: ApprovedVendorContext) {
  if (context.role === "STAFF") return context.branchIds;

  const vendor = await prisma.vendorProfile.findUnique({
    where: { id: context.vendorProfileId },
    select: { defaultBranchId: true },
  });
  const defaultBranchId = vendor?.defaultBranchId;
  return defaultBranchId && context.branchIds.includes(defaultBranchId)
    ? [defaultBranchId]
    : context.branchIds.slice(0, 1);
}

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
  const [logoUrl, notificationBranchIds] = await Promise.all([
    logoPath ? getDocumentSignedUrl(logoPath) : null,
    vendorContext ? notificationBranchIdsFor(vendorContext) : [],
  ]);

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
      {vendorContext ? (
        <LiveVerificationNotifications
          branchIds={notificationBranchIds}
          initialCursor={encodeLiveVerificationCursor({ completedAt: new Date().toISOString(), id: "_" })}
        />
      ) : null}
      {children}
    </PortalShell>
  );
}
