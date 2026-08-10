/**
 * @fileoverview Provides the reusable Portal Header used by portal navigation and page chrome.
 * @module components/layout/PortalHeader
 */

"use client";

import { Bell, Menu } from "lucide-react";

import type { PortalUser } from "@/components/layout/portalTypes";
import { UserMenu } from "@/components/layout/UserMenu";
import { IconButton } from "@/components/ui/IconButton";

/**
 * True-white bar above the page canvas. Shows the active tab's title, a
 * placeholder notifications control, and the account menu.
 */
export function PortalHeader({
  notificationCount = 0,
  onOpenNav,
  settingsHref,
  settingsLabel,
  signOutRedirectTo,
  status,
  title,
  user,
}: {
  notificationCount?: number;
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

        {/* Placeholder — no notifications feed exists yet. */}
        <div className="relative">
          <IconButton
            aria-label={`Notifications (${notificationCount} unread) — coming soon`}
            className="rounded-full"
            title="Notifications — coming soon"
          >
            <Bell aria-hidden="true" size={18} />
          </IconButton>
          {notificationCount > 0 ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -right-1 -top-1 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-danger-fg px-1 text-[0.625rem] font-semibold leading-none text-white"
            >
              {notificationCount > 99 ? "99+" : notificationCount}
            </span>
          ) : null}
        </div>

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
