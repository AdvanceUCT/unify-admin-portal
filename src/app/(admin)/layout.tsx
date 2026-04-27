import {
  BadgeCheck,
  ClipboardList,
  Gauge,
  Landmark,
  ScrollText,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { PortalShell } from "@/components/layout/PortalShell";
import { ADMIN_ROLES, canAccessRoute, ROLE_LABELS, type AdminRole } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";

const navItems = [
  { href: "/", label: "Overview", icon: Gauge },
  { href: "/students", label: "Students", icon: Users },
  { href: "/credentials", label: "Credentials", icon: BadgeCheck },
  { href: "/credentials/batch", label: "Batch issue", icon: ClipboardList },
  { href: "/vendors", label: "Vendors", icon: Landmark },
  { href: "/rules", label: "Rules", icon: SlidersHorizontal },
  { href: "/audit", label: "Audit", icon: ScrollText },
];

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await requireRole(ADMIN_ROLES);
  const role = session.user.role as AdminRole;
  const visibleNavItems = navItems.filter((item) => canAccessRoute(role, item.href));

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
