"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
export function IntegrationNav() {
  const pathname = usePathname();
  const sections = [["/vendor/integrations", "Verification"], ["/vendor/integrations/payments", "Payments"], ["/vendor/integrations/keys", "API keys"]];
  return <nav aria-label="Integration sections" className="flex gap-2 overflow-x-auto border-b border-border sm:gap-6">{sections.map(([href, label]) => <Link key={href} href={href} aria-current={pathname.replace(/\/$/, "") === href ? "page" : undefined} className={`shrink-0 border-b-[3px] px-2 py-3 font-medium transition focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-brand-600 ${pathname.replace(/\/$/, "") === href ? "border-brand-700 font-semibold text-brand-700" : "border-transparent text-fg-muted hover:text-fg"}`}>{label}</Link>)}</nav>;
}
