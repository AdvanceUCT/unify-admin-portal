/**
 * @fileoverview Wraps approved vendor pages with vendor navigation and session checks.
 * @module app/vendor/(portal)/layout
 */

import { PortalShell } from "@/components/layout/PortalShell";
import type { PortalNavItem } from "@/components/layout/portalTypes";
import { AgentStatusIndicator } from "@/features/agent/AgentStatusIndicator";
import { LiveVerificationNotifications } from "@/features/vendors/LiveVerificationNotifications";
import { requireVendorSessionForRender } from "@/lib/auth/session";
import { getVendorInvoiceOwnerContextForRender } from "@/lib/billing/vendorAuthorization";
import { prisma } from "@/lib/db/prisma";
import { getDocumentSignedUrlForRender } from "@/lib/storage/supabase";
import {
  getApprovedVendorContextForUserForRender,
  type ApprovedVendorContext,
} from "@/lib/vendors/context";
import { encodeLiveVerificationCursor } from "@/lib/vendors/liveVerifications";

import { checkVendorAgentHealthAction } from "./actions";

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

const applicantNavItems: PortalNavItem[] = [
  { href: "/vendor", label: "Overview", icon: "overview" },
  { href: "/vendor/application", label: "Application", icon: "application" },
  { href: "/vendor/profile", label: "Profile", icon: "profile" },
  { href: "/vendor/help", label: "Help", icon: "help" },
];

// Invoice access is a separate concern from verification-application
// approval (see src/lib/billing/vendorAuthorization.ts): an owner whose
// approval is later revoked must still be able to reach their invoices, so
// this is checked independently of `context` rather than folded into the
// approved-vendor role branches below.
function navItemsForVendorContext(context: ApprovedVendorContext | null, hasInvoiceAccess: boolean) {
  const baseItems = !context ? applicantNavItems : context.role === "STAFF" ? staffNavItems : ownerNavItems;
  if (!hasInvoiceAccess) return baseItems;

  const invoicesItem: PortalNavItem = { href: "/vendor/invoices", label: "Invoices", icon: "invoices" };
  const profileIndex = baseItems.findIndex((item) => item.href === "/vendor/profile");
  if (profileIndex === -1) return [...baseItems, invoicesItem];

  return [...baseItems.slice(0, profileIndex + 1), invoicesItem, ...baseItems.slice(profileIndex + 1)];
}

function roleLabelForVendorContext(context: ApprovedVendorContext | null) {
  if (!context) return "Applicant";
  return context.role === "STAFF" ? "Staff" : "Owner";
}

async function getVendorPortalChromeProfile(vendorProfileId: string) {
  return prisma.vendorProfile.findUnique({
    where: { id: vendorProfileId },
    select: { defaultBranchId: true, logoPath: true },
  });
}

function notificationBranchIdsFor(
  context: ApprovedVendorContext,
  defaultBranchId: string | null,
) {
  if (context.role === "STAFF") return context.branchIds;

  return defaultBranchId && context.branchIds.includes(defaultBranchId)
    ? [defaultBranchId]
    : context.branchIds.slice(0, 1);
}

export default async function VendorPortalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await requireVendorSessionForRender();
  const [vendorContext, invoiceOwnerContext] = await Promise.all([
    getApprovedVendorContextForUserForRender(session.user.id),
    getVendorInvoiceOwnerContextForRender(session.user.id),
  ]);
  const chromeProfile = vendorContext
    ? await getVendorPortalChromeProfile(vendorContext.vendorProfileId)
    : null;
  const logoUrl = chromeProfile?.logoPath
    ? await getDocumentSignedUrlForRender(chromeProfile.logoPath)
    : null;
  const notificationBranchIds = vendorContext
    ? notificationBranchIdsFor(vendorContext, chromeProfile?.defaultBranchId ?? null)
    : [];

  return (
    <PortalShell
      brand={{
        brandName: "Unify",
        logoUrl,
        tenantName: vendorContext?.companyName ?? "Verifier onboarding",
      }}
      fallbackTitle="Vendor"
      navItems={navItemsForVendorContext(vendorContext, Boolean(invoiceOwnerContext))}
      portal="vendor"
      settingsHref="/vendor/profile"
      settingsLabel="Profile"
      signOutRedirectTo="/vendor/sign-in"
      status={
        vendorContext ? (
          <AgentStatusIndicator
            checkHealth={checkVendorAgentHealthAction}
            offlineHref="/vendor/help"
          />
        ) : null
      }
      user={{
        email: session.user.email,
        image: session.user.image,
        name: session.user.name,
        roleLabel: roleLabelForVendorContext(vendorContext),
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
