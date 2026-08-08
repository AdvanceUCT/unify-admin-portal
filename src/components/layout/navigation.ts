import type { PortalNavItem } from "@/components/layout/portalTypes";

function matchesHref(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  // The portal roots ("/" and "/vendor") would otherwise prefix-match everything.
  if (href === "/") return false;

  return pathname.startsWith(`${href}/`);
}

/**
 * Resolves the nav item for the current route. Longest matching href wins, so
 * "/vendor/branches" beats the "/vendor" overview, and "/students/import" keeps
 * "Students" lit.
 */
export function resolveActiveNavItem(
  pathname: string | null,
  navItems: PortalNavItem[],
): PortalNavItem | null {
  if (!pathname) return null;

  return navItems
    .filter((item) => matchesHref(pathname, item.href))
    .sort((a, b) => b.href.length - a.href.length)[0] ?? null;
}
