"use client";

import Link from "next/link";

import { NAV_ICONS } from "@/components/layout/navIcons";
import type { PortalNavItem } from "@/components/layout/portalTypes";
import { cn } from "@/lib/cn";

/**
 * The nav list, shared by the fixed sidebar and the mobile drawer so there is
 * only one rendering of navigation in the app.
 *
 * In the fixed sidebar the active item runs flush to the right edge and is
 * filled with the page background, so it reads as a tab flowing into the
 * content column — the concave corner geometry lives in `.nav-item-active`
 * in globals.css. The drawer has no content column to flow into, so
 * `.nav-drawer` downgrades the active item to a plain pill.
 */
export function SidebarNav({
  activeHref,
  navItems,
  onNavigate,
  variant = "fixed",
}: {
  activeHref: string | null;
  navItems: PortalNavItem[];
  onNavigate?: () => void;
  variant?: "fixed" | "drawer";
}) {
  return (
    <nav
      aria-label="Portal"
      className={cn("flex flex-col gap-1 pl-3", variant === "drawer" && "nav-drawer")}
    >
      {navItems.map((item) => {
        const Icon = NAV_ICONS[item.icon];
        const isActive = item.href === activeHref;

        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "nav-item flex h-11 items-center gap-3 px-4 text-sm transition",
              isActive
                ? "nav-item-active font-semibold"
                : "mr-3 rounded-lg font-medium text-sidebar-fg-muted hover:bg-white/10 hover:text-sidebar-fg",
            )}
            href={item.href}
            key={item.href}
            onClick={onNavigate}
          >
            <Icon
              aria-hidden="true"
              className={cn("shrink-0", isActive ? "text-brand-600" : "text-current")}
              size={18}
              strokeWidth={isActive ? 2.25 : 1.75}
            />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
