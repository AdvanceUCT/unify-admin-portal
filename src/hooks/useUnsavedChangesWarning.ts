"use client";

import { useEffect } from "react";

const DEFAULT_MESSAGE = "You have unsaved changes. Are you sure you want to leave this page?";

let dirtyCount = 0;
let activeMessage = DEFAULT_MESSAGE;

/** Whether any mounted `useUnsavedChangesWarning` guard currently has unsaved changes. */
export function hasUnsavedChanges(): boolean {
  return dirtyCount > 0;
}

/**
 * Shows a confirm dialog if there are unsaved changes anywhere on the page.
 * Use before imperative navigation (e.g. a sign-out button) that a same-origin
 * link click wouldn't otherwise intercept. Returns true if it's safe to proceed.
 */
export function confirmDiscardUnsavedChanges(): boolean {
  if (dirtyCount === 0) return true;
  return window.confirm(activeMessage);
}

/**
 * Warns before the user leaves the page while `hasChanges` is true: closing or
 * refreshing the tab, typing a new URL, or clicking an in-app link.
 */
export function useUnsavedChangesWarning(hasChanges: boolean, message = DEFAULT_MESSAGE) {
  useEffect(() => {
    if (!hasChanges) return;

    dirtyCount += 1;
    activeMessage = message;

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

      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleClick, true);

    return () => {
      dirtyCount -= 1;
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleClick, true);
    };
  }, [hasChanges, message]);
}
