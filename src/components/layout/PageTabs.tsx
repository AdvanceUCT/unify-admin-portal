/**
 * @fileoverview Provides the reusable Page Tabs used by portal navigation and page chrome.
 * @module components/layout/PageTabs
 */

import Link from "next/link";

import { cn } from "@/lib/cn";

export type PageTab = {
  count?: number;
  href: string;
  isActive: boolean;
  label: string;
};

/**
 * In-page section switcher, e.g. the audit page's Credential/Vendor/Import
 * logs. A neutral grey track holds brand-tinted pills — every tab carries its
 * own fill (not just the active one), with the active pill switching to a
 * solid brand fill. Sits directly under the header now that pages don't
 * render their own title, so it's normally the first element in the page body.
 */
export function PageTabs({ tabs }: { tabs: PageTab[] }) {
  return (
    <nav aria-label="Page sections" className="inline-flex flex-wrap items-center gap-2 rounded-lg bg-surface-muted p-1.5">
      {tabs.map((tab) => (
        <Link
          aria-current={tab.isActive ? "page" : undefined}
          className={cn(
            "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition",
            tab.isActive
              ? "bg-brand-600 text-white shadow-sm"
              : "bg-brand-100 text-brand-700 hover:bg-brand-200",
          )}
          href={tab.href}
          key={tab.href}
        >
          {tab.label}
          {tab.count !== undefined && tab.count > 0 ? (
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-xs font-semibold leading-none",
                tab.isActive ? "bg-white/25 text-white" : "bg-brand-200 text-brand-800",
              )}
            >
              {tab.count}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
