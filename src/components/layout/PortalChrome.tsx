/**
 * @fileoverview Provides the reusable Portal Chrome used by portal navigation and page chrome.
 * @module components/layout/PortalChrome
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";

import { resolveActiveNavItem } from "@/components/layout/navigation";
import { PortalBrand } from "@/components/layout/PortalBrand";
import { PortalHeader } from "@/components/layout/PortalHeader";
import type {
  PortalBrandIdentity,
  PortalNavItem,
  PortalUser,
} from "@/components/layout/portalTypes";
import { SidebarNav } from "@/components/layout/SidebarNav";
import { IconButton } from "@/components/ui/IconButton";
import { cn } from "@/lib/cn";

/**
 * Owns the one piece of shared chrome state — whether the mobile drawer is
 * open — and the current pathname, so the sidebar, the drawer and the header
 * title all derive from a single source of truth.
 */
export function PortalChrome({
  brand,
  children,
  fallbackTitle,
  navItems,
  settingsHref,
  settingsLabel,
  signOutRedirectTo,
  status,
  user,
}: {
  brand: PortalBrandIdentity;
  children: React.ReactNode;
  fallbackTitle: string;
  navItems: PortalNavItem[];
  settingsHref: string;
  settingsLabel?: string;
  signOutRedirectTo?: string;
  status?: React.ReactNode;
  user: PortalUser;
}) {
  const pathname = usePathname();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  /*
   * The drawer stores the route it was opened on rather than a bare boolean, so
   * navigating (including via back/forward) closes it as a derivation instead of
   * an effect that would set state after render.
   */
  const [openedAtPathname, setOpenedAtPathname] = useState<string | null>(null);
  const isDrawerOpen = openedAtPathname !== null && openedAtPathname === pathname;

  function openDrawer() {
    setOpenedAtPathname(pathname);
  }

  function closeDrawer() {
    setOpenedAtPathname(null);
  }

  const activeItem = resolveActiveNavItem(pathname, navItems);

  useEffect(() => {
    if (!isDrawerOpen) return;

    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenedAtPathname(null);
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDrawerOpen]);

  const sidebarBackground =
    "bg-[linear-gradient(180deg,var(--sidebar-from),var(--sidebar-to))]";

  return (
    <>
      <aside
        className={cn(
          // No shadow here — the sidebar is meant to blend seamlessly into the
          // content column at the active nav tab, and a cast shadow breaks that seam.
          // no-scrollbar: a visible scrollbar reserves layout width, and toggling
          // it (e.g. expanding a collapsible sub-nav group past the viewport
          // height) would either jump the content narrower or, with
          // scrollbar-gutter reserved permanently, leave a permanent gap between
          // the active tab and the sidebar's right edge — breaking the flush
          // flowing-tab seam either way. Scrolling still works; only the bar is hidden.
          "fixed inset-y-0 left-0 hidden w-64 flex-col overflow-y-auto pb-6 pt-6 no-scrollbar lg:flex",
          sidebarBackground,
        )}
      >
        <PortalBrand {...brand} className="mb-8 px-6" />
        <SidebarNav navItems={navItems} pathname={pathname} />
      </aside>

      {isDrawerOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Close navigation"
            className="absolute inset-0 bg-neutral-900/50"
            onClick={closeDrawer}
            tabIndex={-1}
            type="button"
          />
          <div
            aria-label="Navigation"
            aria-modal="true"
            className={cn(
              "absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto pb-6 pt-6 shadow-lg no-scrollbar",
              sidebarBackground,
            )}
            role="dialog"
          >
            <div className="mb-8 flex items-start justify-between gap-3 px-6">
              <PortalBrand {...brand} />
              <IconButton
                aria-label="Close navigation"
                onClick={closeDrawer}
                ref={closeButtonRef}
                tone="onBrand"
              >
                <X aria-hidden="true" size={18} />
              </IconButton>
            </div>
            <SidebarNav
              navItems={navItems}
              onNavigate={closeDrawer}
              pathname={pathname}
              variant="drawer"
            />
          </div>
        </div>
      ) : null}

      <div className="lg:pl-64">
        <PortalHeader
          onOpenNav={openDrawer}
          settingsHref={settingsHref}
          settingsLabel={settingsLabel}
          signOutRedirectTo={signOutRedirectTo}
          status={status}
          title={activeItem?.label ?? fallbackTitle}
          user={user}
        />
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
      </div>
    </>
  );
}
