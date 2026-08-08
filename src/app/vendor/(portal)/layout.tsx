import { PortalShell } from "@/components/layout/PortalShell";
import type { PortalNavItem } from "@/components/layout/portalTypes";
import { LiveVerificationNotifications } from "@/features/vendors/LiveVerificationNotifications";
import { requireVendorSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getDocumentSignedUrl } from "@/lib/storage/supabase";
import { getApprovedVendorContextForUser, type ApprovedVendorContext } from "@/lib/vendors/context";
import { encodeLiveVerificationCursor } from "@/lib/vendors/liveVerifications";
import { getVendorProfileLogoPath } from "@/lib/vendors/profile";

const ownerNavItems: PortalNavItem[] = [
  { href: "/vendor", label: "Overview", icon: "overview" },
  { href: "/vendor/verifications", label: "Verifications", icon: "verifications" },
  { href: "/vendor/branches", label: "Branches", icon: "branches" },
  { href: "/vendor/staff", label: "Staff", icon: "staff" },
  { href: "/vendor/application", label: "Application", icon: "application" },
  { href: "/vendor/profile", label: "Profile", icon: "profile" },
  { href: "/vendor/integrations", label: "Integrations", icon: "integrations" },
  { href: "/vendor/help", label: "Help", icon: "help" },
];

const staffNavItems: PortalNavItem[] = [
  { href: "/vendor", label: "Overview", icon: "overview" },
  { href: "/vendor/verifications", label: "Verifications", icon: "verifications" },
  { href: "/vendor/branches", label: "Branches", icon: "branches" },
  { href: "/vendor/help", label: "Help", icon: "help" },
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
      brand={{
        brandName: "Unify",
        logoUrl,
        tenantName: vendorContext?.companyName ?? "Verifier onboarding",
      }}
      fallbackTitle="Vendor"
      navItems={vendorContext?.role === "STAFF" ? staffNavItems : ownerNavItems}
      portal="vendor"
      settingsHref="/vendor/profile"
      signOutRedirectTo="/vendor/sign-in"
      user={{
        email: session.user.email,
        image: session.user.image,
        name: session.user.name,
        roleLabel: vendorContext?.role === "STAFF" ? "Staff" : "Owner",
      }}
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
