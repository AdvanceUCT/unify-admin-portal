"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, LogOut, Settings } from "lucide-react";

import type { PortalUser } from "@/components/layout/portalTypes";
import { Avatar } from "@/components/ui/Avatar";
import { useSignOut } from "@/hooks/useSignOut";
import { cn } from "@/lib/cn";

/**
 * Header account control: avatar + name/role, opening a small menu.
 *
 * Hand-rolled rather than pulled from a headless library — the project has no
 * Radix/Headless UI dependency and this is the only menu in the shell. It
 * implements the parts that matter: outside click, Escape, aria-expanded,
 * and focus moving into the menu on open.
 */
export function UserMenu({
  settingsHref,
  signOutRedirectTo,
  user,
}: {
  settingsHref: string;
  signOutRedirectTo?: string;
  user: PortalUser;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuId = useId();
  const { errorMessage, isPending, signOut } = useSignOut(signOutRedirectTo);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    menuRef.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus();
  }, [isOpen]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className={cn(
          "flex h-11 items-center gap-2.5 rounded-full border border-transparent pl-1 pr-2 transition",
          "hover:border-border hover:bg-surface-muted",
          isOpen && "border-border bg-surface-muted",
        )}
        onClick={() => setIsOpen((open) => !open)}
        ref={triggerRef}
        type="button"
      >
        <Avatar imageUrl={user.image} name={user.name} size="md" />
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block truncate text-sm font-semibold leading-tight text-fg">
            {user.name}
          </span>
          <span className="block truncate text-xs leading-tight text-fg-subtle">
            {user.roleLabel}
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn("shrink-0 text-fg-subtle transition", isOpen && "rotate-180")}
          size={16}
        />
      </button>

      {isOpen ? (
        <div
          aria-label="Account"
          className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-lg border border-border bg-surface shadow-lg"
          id={menuId}
          ref={menuRef}
          role="menu"
        >
          <div className="border-b border-border px-4 py-3">
            <p className="truncate text-sm font-semibold text-fg">{user.name}</p>
            <p className="truncate text-xs text-fg-subtle">{user.email}</p>
          </div>

          <div className="p-1">
            <Link
              className="flex h-9 items-center gap-2.5 rounded-md px-3 text-sm font-medium text-fg-muted transition hover:bg-surface-muted hover:text-fg"
              href={settingsHref}
              onClick={() => setIsOpen(false)}
              role="menuitem"
            >
              <Settings aria-hidden="true" size={16} />
              Settings
            </Link>
            <button
              className="flex h-9 w-full items-center gap-2.5 rounded-md px-3 text-sm font-medium text-danger-fg transition hover:bg-danger-bg disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isPending}
              onClick={signOut}
              role="menuitem"
              type="button"
            >
              <LogOut aria-hidden="true" size={16} />
              {isPending ? "Signing out..." : "Sign out"}
            </button>
          </div>

          {errorMessage ? (
            <p className="border-t border-border px-4 py-2 text-xs text-danger-fg" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
