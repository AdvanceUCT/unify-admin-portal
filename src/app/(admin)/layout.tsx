import {
  ClipboardList,
  Gauge,
  Landmark,
  Layers,
  ScrollText,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
  Users,
} from "lucide-react";
import { redirect } from "next/navigation";
import { PortalShell } from "@/components/layout/PortalShell";
import {
  ADMIN_ROLES,
  canAccessRoute,
  ROLE_LABELS,
  type AdminRole,
} from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { env } from "@/lib/config/env";
import { getUniversityProfile } from "@/lib/university/profile";

const navItems = [
  { href: "/", label: "Overview", icon: Gauge },
  { href: "/students", label: "Students", icon: Users },
  { href: "/credentials/issuance", label: "Issue Credentials", icon: ClipboardList },
  { href: "/schemas", label: "Schemas", icon: Layers },
  { href: "/vendors", label: "Vendors", icon: Landmark },
  { href: "/rules", label: "Rules", icon: SlidersHorizontal },
  { href: "/audit", label: "Audit", icon: ScrollText },
  { href: "/users", label: "Users", icon: UserCog },
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
  const visibleNavItems = navItems.filter((item) =>
    canAccessRoute(role, item.href),
  );

  return (
    <PortalShell
      context="Credential governance"
      navItems={visibleNavItems}
      productName="UNIFY Admin"
      sessionLabel={`${session.user.name} · ${ROLE_LABELS[role]}`}
      utilityIcon={ShieldCheck}
    >
      {children}
    </PortalShell>
  );
}

function SystemNotConfiguredPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f8fa] px-6 text-zinc-950">
      <div className="max-w-lg rounded-lg border border-zinc-200 bg-white p-6 text-center">
        <h1 className="text-xl font-semibold">
          System setup is not yet complete
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Please contact your Super Administrator to finish the onboarding
          wizard.
        </p>
      </div>
    </div>
  );
}
