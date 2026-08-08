"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const DEFAULT_MESSAGE = "You have unsaved changes. Are you sure you want to leave this page?";

let dirtyCount = 0;
let activeMessage = DEFAULT_MESSAGE;
let showDialog: ((message: string) => Promise<boolean>) | null = null;

/**
 * Registers the portal's own confirmation dialog so in-app navigation warnings render as a
 * styled modal instead of the browser's native `window.confirm` popup. Called once by
 * `UnsavedChangesDialogProvider`, which is mounted in the root layout.
 */
export function registerUnsavedChangesDialog(fn: ((message: string) => Promise<boolean>) | null) {
  showDialog = fn;
}

/** Whether any mounted `useUnsavedChangesWarning` guard currently has unsaved changes. */
export function hasUnsavedChanges(): boolean {
  return dirtyCount > 0;
}

/**
 * Shows the portal's confirmation dialog if there are unsaved changes anywhere on the page.
 * Use before imperative navigation (e.g. a sign-out button) that a same-origin
 * link click wouldn't otherwise intercept. Resolves true if it's safe to proceed.
 */
export async function confirmDiscardUnsavedChanges(): Promise<boolean> {
  if (dirtyCount === 0) return true;
  if (showDialog) return showDialog(activeMessage);
  return window.confirm(activeMessage);
}

/**
 * Warns before the user leaves the page while `hasChanges` is true: closing or
 * refreshing the tab, typing a new URL, or clicking an in-app link.
 */
export function useUnsavedChangesWarning(hasChanges: boolean, message = DEFAULT_MESSAGE) {
  const router = useRouter();

  useEffect(() => {
    if (!hasChanges) return;

    dirtyCount += 1;
    activeMessage = message;
    const guardToken = crypto.randomUUID();
    const originalState = window.history.state;
    let restoringGuard = false;

    window.history.pushState(
      { ...(originalState ?? {}), __unifyUnsavedGuard: guardToken },
      "",
      window.location.href,
    );

    // Tab close/refresh is always the browser's own native dialog; no web app can restyle it.
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = message;
    }

    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as HTMLElement | null)?.closest("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;

      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }

      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      // preventDefault() here (before Link's own click handler runs) is enough to stop
      // Next.js Link from navigating — it bails out whenever the event arrives already
      // prevented. We then drive the actual navigation ourselves once confirmed, rather
      // than trying to replay the click, which isn't reliable across Link's internals.
      event.preventDefault();

      void (async () => {
        const confirmed = showDialog ? await showDialog(message) : window.confirm(message);
        if (confirmed) router.push(`${url.pathname}${url.search}${url.hash}`);
      })();
    }

    function handlePopState() {
      if (restoringGuard) {
        restoringGuard = false;
        return;
      }

      void (async () => {
        const confirmed = showDialog ? await showDialog(message) : window.confirm(message);
        if (confirmed) {
          window.history.back();
          return;
        }

        restoringGuard = true;
        window.history.forward();
      })();
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("popstate", handlePopState);
    document.addEventListener("click", handleClick, true);

    return () => {
      dirtyCount -= 1;
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState);
      document.removeEventListener("click", handleClick, true);

      if (window.history.state?.__unifyUnsavedGuard === guardToken) {
        window.history.replaceState(originalState, "", window.location.href);
        window.history.back();
      }
    };
  }, [hasChanges, message, router]);
}
