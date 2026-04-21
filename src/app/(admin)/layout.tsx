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
import { getCurrentSession } from "@/lib/auth/session";

const navItems = [
  { href: "/", label: "Overview", icon: Gauge },
  { href: "/students", label: "Students", icon: Users },
  { href: "/credentials", label: "Credentials", icon: BadgeCheck },
  { href: "/credentials/batch", label: "Batch issue", icon: ClipboardList },
  { href: "/vendors", label: "Vendors", icon: Landmark },
  { href: "/rules", label: "Rules", icon: SlidersHorizontal },
  { href: "/audit", label: "Audit", icon: ScrollText },
];

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = getCurrentSession();

  return (
    <PortalShell
      context="Credential governance"
      navItems={navItems}
      productName="UNIFY Admin"
      sessionLabel={`${session.name} · ${session.role}`}
      utilityIcon={ShieldCheck}
    >
      {children}
    </PortalShell>
  );
}
