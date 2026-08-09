import type { PortalNavItem } from "@/components/layout/portalTypes";

type ActiveNavEntry = { href: string; label: string };

function matchesHref(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  // The portal roots ("/" and "/vendor") would otherwise prefix-match everything.
  if (href === "/") return false;

  return pathname.startsWith(`${href}/`);
}

/**
 * Resolves the nav entry for the current route, used for the header title.
 * Considers child routes too (flattened alongside their parent), so a page
 * reached through a collapsible group — e.g. "/credentials/issuance/batch"
 * under "Issue Credentials" — titles itself "Batch issuance", not the
 * parent's generic label. Longest matching href wins.
 */
export function resolveActiveNavItem(
  pathname: string | null,
  navItems: PortalNavItem[],
): ActiveNavEntry | null {
  if (!pathname) return null;

  const flatEntries: ActiveNavEntry[] = navItems.flatMap((item) => [
    { href: item.href, label: item.label },
    ...(item.children ?? []),
  ]);

  return (
    flatEntries
      .filter((entry) => matchesHref(pathname, entry.href))
      .sort((a, b) => b.href.length - a.href.length)[0] ?? null
  );
}

/**
 * Whether a top-level nav item should show the sidebar's active-tab styling.
 * Unlike `resolveActiveNavItem`, this deliberately does NOT distinguish
 * between a parent and its children — being on any child route keeps the
 * *parent* highlighted, and children never get their own active state.
 */
export function isNavItemActive(pathname: string | null, item: PortalNavItem): boolean {
  if (!pathname) return false;
  if (matchesHref(pathname, item.href)) return true;

  return item.children?.some((child) => matchesHref(pathname, child.href)) ?? false;
}
