"use client";
import { usePathname } from "next/navigation";
import { PageTabs } from "@/components/layout/PageTabs";

export function IssuanceTabs() {
  const pathname = usePathname();
  return (
    <PageTabs
      ariaLabel="Issuance sections"
      tabs={[
        { href: "/credentials/issuance/batch", label: "Batch issuance" },
        {
          href: "/credentials/issuance/individual",
          label: "Individual issuance",
        },
        { href: "/credentials/issuance/renewals", label: "Renewals" },
      ].map((tab) => ({
        ...tab,
        isActive: pathname === tab.href || pathname.startsWith(`${tab.href}/`),
      }))}
    />
  );
}
