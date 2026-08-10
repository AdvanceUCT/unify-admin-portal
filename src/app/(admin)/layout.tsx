import { redirect } from "next/navigation";
import { PortalShell } from "@/components/layout/PortalShell";
import type { PortalNavItem } from "@/components/layout/portalTypes";
import { AgentStatusIndicator } from "@/features/agent/AgentStatusIndicator";
import {
  ADMIN_ROLES,
  canAccessRoute,
  ROLE_LABELS,
  type AdminRole,
} from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { env } from "@/lib/config/env";
import { getDocumentSignedUrl } from "@/lib/storage/supabase";
import { getUniversityProfile } from "@/lib/university/profile";

const navItems: (PortalNavItem & { allowedRoles?: readonly AdminRole[] })[] = [
  { href: "/", label: "Overview", icon: "overview" },
  { href: "/students", label: "Students", icon: "students" },
  {
    href: "/credentials/issuance",
    label: "Issue Credentials",
    icon: "application",
    children: [
      { href: "/credentials/issuance/batch", label: "Batch issuance" },
      { href: "/credentials/issuance/individual", label: "Individual issuance" },
    ],
  },
  {
    href: "/credentials/schemas",
    label: "Credential Schemas",
    icon: "schemas",
    allowedRoles: ["SUPER_ADMIN", "ADMIN"] as const,
  },
  { href: "/vendors", label: "Vendors", icon: "vendors" },
  { href: "/audit", label: "Audit", icon: "audit" },
  { href: "/users", label: "Users", icon: "users" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await requireRole(ADMIN_ROLES);
  const profile = await getUniversityProfile();
  const bypassSetup = env.SETUP_BYPASS;
  const isComplete = bypassSetup || profile?.setupStatus === "COMPLETE";
  const isSuperAdmin = session.user.role === "SUPER_ADMIN";

  if (!isComplete) {
    if (isSuperAdmin) {
      redirect("/setup");
    }

    return <SystemNotConfiguredPage />;
  }

  const role = session.user.role as AdminRole;
  const visibleNavItems = navItems.filter(
    (item) =>
      canAccessRoute(role, item.href) &&
      (item.allowedRoles?.some((allowedRole) => allowedRole === role) ?? true),
  );
  const logoUrl = profile?.logoPath
    ? await getDocumentSignedUrl(profile.logoPath)
    : profile?.logoUrl;

  return (
    <PortalShell
      brand={{
        brandName: "Unify",
        logoUrl,
        tenantName: profile?.name ?? "Credential governance",
      }}
      fallbackTitle="Admin"
      navItems={visibleNavItems}
      portal="admin"
      settingsHref="/settings"
      status={<AgentStatusIndicator />}
      user={{
        email: session.user.email,
        image: session.user.image,
        name: session.user.name,
        roleLabel: ROLE_LABELS[role],
      }}
    >
      {children}
    </PortalShell>
  );
}

function SystemNotConfiguredPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-6 text-fg">
      <div className="max-w-lg rounded-lg border border-border bg-surface p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold">
          System setup is not yet complete
        </h1>
        <p className="mt-2 text-sm text-fg-muted">
          Please contact your Super Administrator to finish the onboarding
          wizard.
        </p>
      </div>
    </div>
  );
}
