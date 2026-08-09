"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";

import { NAV_ICONS } from "@/components/layout/navIcons";
import { isNavItemActive } from "@/components/layout/navigation";
import type { PortalNavItem } from "@/components/layout/portalTypes";
import { cn } from "@/lib/cn";

const rowClassName = (isSelected: boolean) =>
  cn(
    "nav-item flex h-11 items-center gap-3 px-4 text-sm transition",
    isSelected
      ? "nav-item-active font-semibold"
      : "mr-3 rounded-lg font-medium text-sidebar-fg-muted hover:bg-white/10 hover:text-sidebar-fg",
  );

/**
 * The nav list, shared by the fixed sidebar and the mobile drawer so there is
 * only one rendering of navigation in the app.
 *
 * In the fixed sidebar the active item runs flush to the right edge and is
 * filled with the page background, so it reads as a tab flowing into the
 * content column — the concave corner geometry lives in `.nav-item-active`
 * in globals.css. The drawer has no content column to flow into, so
 * `.nav-drawer` downgrades the active item to a plain pill.
 *
 * Exactly one top-level item is ever selected — expanding a collapsible
 * group (see `ExpandableNavItem`) deselects whatever else was selected, and
 * navigating anywhere else collapses/deselects the group in turn. That
 * requires selection to be tracked here, one level up from any single item,
 * rather than purely derived per-item from the route.
 */
export function SidebarNav({
  navItems,
  onNavigate,
  pathname,
  variant = "fixed",
}: {
  navItems: PortalNavItem[];
  onNavigate?: () => void;
  pathname: string | null;
  variant?: "fixed" | "drawer";
}) {
  /*
   * `undefined` — no explicit choice: derive selection from the route.
   * A string    — this exact top-level href is exclusively selected. Only
   *               ever set by expanding a group — there's no page to wait on
   *               there, so it's fine (and necessary) for this to apply
   *               immediately.
   * `null`      — explicitly nothing. Set by collapsing a group, so a route
   *               that would otherwise reselect it doesn't immediately
   *               override the collapse.
   *
   * Clicking a *link* (a leaf item, or one of a group's children) never
   * touches this directly — see the pathname-change reset below for why.
   */
  const [manualSelection, setManualSelection] = useState<string | null | undefined>(undefined);

  /*
   * Resets the override the moment the route actually changes — not the
   * moment something is clicked. `pathname` only updates once Next.js
   * finishes the navigation, so selection stays exactly as it was
   * (whichever item was selected before the click) for the entire duration
   * of the transition, then moves in one step, in sync with the new page
   * actually appearing. Two earlier approaches both got this wrong: resetting
   * on click deferred to the stale *old* pathname for a frame and could flash
   * an unrelated item selected; setting the clicked item selected immediately
   * fixed that but made the sidebar jump ahead of the page it was supposedly
   * describing. Tying the reset to the prop itself is the fix for both.
   *
   * This is React's supported pattern for "reset state when a prop changes"
   * — a plain conditional during render, not a useEffect (which would be a
   * lint violation here) and not a click handler (which would reintroduce
   * the click-timing problem this exists to avoid).
   */
  const [committedPathname, setCommittedPathname] = useState(pathname);
  if (pathname !== committedPathname) {
    setCommittedPathname(pathname);
    setManualSelection(undefined);
  }

  function isSelected(item: PortalNavItem) {
    if (manualSelection !== undefined) return manualSelection === item.href;
    return isNavItemActive(pathname, item);
  }

  function toggleExpanded(item: PortalNavItem) {
    setManualSelection(isSelected(item) ? null : item.href);
  }

  return (
    <nav
      aria-label="Portal"
      className={cn("flex flex-col gap-1 pl-3", variant === "drawer" && "nav-drawer")}
    >
      {navItems.map((item) =>
        item.children && item.children.length > 0 ? (
          <ExpandableNavItem
            isSelected={isSelected(item)}
            item={item}
            key={item.href}
            onChildNavigate={onNavigate}
            onToggle={() => toggleExpanded(item)}
          />
        ) : (
          <NavLink isSelected={isSelected(item)} item={item} key={item.href} onNavigate={onNavigate} />
        ),
      )}
    </nav>
  );
}

function NavLink({
  isSelected,
  item,
  onNavigate,
}: {
  isSelected: boolean;
  item: PortalNavItem;
  onNavigate?: () => void;
}) {
  const Icon = NAV_ICONS[item.icon];

  return (
    <Link
      aria-current={isSelected ? "page" : undefined}
      className={rowClassName(isSelected)}
      href={item.href}
      onClick={onNavigate}
    >
      <Icon
        aria-hidden="true"
        className={cn("shrink-0", isSelected ? "text-brand-600" : "text-current")}
        size={18}
        strokeWidth={isSelected ? 2.25 : 1.75}
      />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

/**
 * A parent item with sub-routes. It's a disclosure toggle, not a link — it
 * has no page of its own. Its expanded state mirrors `isSelected` exactly:
 * expanding it is what selects it, collapsing it is what deselects it.
 * Sub-items never get their own active state; only the parent ever lights up.
 *
 * Clicking a child doesn't touch selection at all — the parent is already
 * the selected item (that's the only way its children are visible to click
 * in the first place), so there's nothing to update, and nothing that could
 * flash incorrect or jump ahead of the page it's navigating to.
 */
function ExpandableNavItem({
  isSelected,
  item,
  onChildNavigate,
  onToggle,
}: {
  isSelected: boolean;
  item: PortalNavItem;
  onChildNavigate?: () => void;
  onToggle: () => void;
}) {
  const Icon = NAV_ICONS[item.icon];
  const isExpanded = isSelected;

  return (
    <div>
      <button
        aria-expanded={isExpanded}
        className={cn(rowClassName(isSelected), "w-full")}
        onClick={onToggle}
        type="button"
      >
        <Icon
          aria-hidden="true"
          className={cn("shrink-0", isSelected ? "text-brand-600" : "text-current")}
          size={18}
          strokeWidth={isSelected ? 2.25 : 1.75}
        />
        <span className="flex-1 truncate text-left">{item.label}</span>
        <ChevronDown
          aria-hidden="true"
          className={cn("shrink-0 transition-transform", !isExpanded && "-rotate-90")}
          size={16}
        />
      </button>

      {isExpanded ? (
        <div className="mt-1 flex flex-col gap-1">
          {item.children!.map((child) => (
            <Link
              className="flex h-9 items-center rounded-md py-2 pl-11 pr-4 text-sm text-sidebar-fg-muted transition hover:bg-white/10 hover:text-sidebar-fg"
              href={child.href}
              key={child.href}
              onClick={onChildNavigate}
            >
              <span className="truncate">{child.label}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
