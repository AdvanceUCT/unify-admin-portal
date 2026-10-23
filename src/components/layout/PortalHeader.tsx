/**
 * @fileoverview Provides the reusable Portal Header used by portal navigation and page chrome.
 * @module components/layout/PortalHeader
 */

"use client";

import { Menu } from "lucide-react";

import type { PortalUser } from "@/components/layout/portalTypes";
import { UserMenu } from "@/components/layout/UserMenu";
import { IconButton } from "@/components/ui/IconButton";

/**
 * True-white bar above the page canvas. Shows the active tab's title,
 * portal status, and the account menu.
 */
export function PortalHeader({
  onOpenNav,
  settingsHref,
  settingsLabel,
  signOutRedirectTo,
  status,
  title,
  user,
}: {
  onOpenNav: () => void;
  settingsHref: string;
  settingsLabel?: string;
  signOutRedirectTo?: string;
  /** Portal-specific status slot, e.g. the admin agent-service indicator. */
  status?: React.ReactNode;
  title: string;
  user: PortalUser;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-border bg-surface-header px-4 shadow-header sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <IconButton
          aria-label="Open navigation"
          className="lg:hidden"
          onClick={onOpenNav}
          tone="ghost"
        >
          <Menu aria-hidden="true" size={20} />
        </IconButton>
        <h1 className="truncate text-lg font-semibold tracking-tight text-fg">{title}</h1>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {status}

        <span aria-hidden="true" className="hidden h-8 w-px bg-border sm:block" />

        <UserMenu
          settingsHref={settingsHref}
          settingsLabel={settingsLabel}
          signOutRedirectTo={signOutRedirectTo}
          user={user}
        />
      </div>
    </header>
  );
}
