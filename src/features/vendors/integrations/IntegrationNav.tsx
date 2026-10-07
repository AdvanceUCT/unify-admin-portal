"use client";
import { usePathname } from "next/navigation";
import { PageTabs } from "@/components/layout/PageTabs";
export function IntegrationNav() {
  const pathname = usePathname();
  const sections = [["", "Overview"], ["/guides", "Setup guides"], ["/keys", "API keys"], ["/callbacks", "Callbacks"], ["/reference", "API reference"]];
  return <PageTabs ariaLabel="Integration sections" tabs={sections.map(([suffix, label]) => ({ label, href: `/vendor/integrations${suffix}`, isActive: suffix ? pathname.startsWith(`/vendor/integrations${suffix}`) : pathname === "/vendor/integrations" }))} />;
}
