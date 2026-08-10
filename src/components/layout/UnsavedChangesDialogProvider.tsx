/**
 * @fileoverview Provides the reusable Unsaved Changes Dialog Provider used by portal navigation and page chrome.
 * @module components/layout/UnsavedChangesDialogProvider
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";

import { registerUnsavedChangesDialog } from "@/hooks/useUnsavedChangesWarning";

/**
 * Renders the portal's styled confirmation dialog for in-app "leave this page?" prompts,
 * replacing the browser's native `window.confirm` popup. Mount once in the root layout.
 */
export function UnsavedChangesDialogProvider() {
  const [request, setRequest] = useState<{ message: string; resolve: (value: boolean) => void } | null>(null);

  useEffect(() => {
    registerUnsavedChangesDialog(
      (message) => new Promise<boolean>((resolve) => setRequest({ message, resolve })),
    );
    return () => registerUnsavedChangesDialog(null);
  }, []);

  const resolveWith = useCallback(
    (value: boolean) => {
      request?.resolve(value);
      setRequest(null);
    },
    [request],
  );

  if (!request) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 px-4"
      onClick={() => resolveWith(false)}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="unsaved-changes-title"
        aria-describedby="unsaved-changes-description"
        className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <TriangleAlert className="size-5" />
          </span>
          <div className="min-w-0">
            <p id="unsaved-changes-title" className="font-semibold text-zinc-950">
              Leave this page?
            </p>
            <p id="unsaved-changes-description" className="mt-1 text-sm text-zinc-600">
              {request.message}
            </p>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => resolveWith(false)}
            className="h-9 rounded-md border border-zinc-200 px-3 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-950"
          >
            Stay on page
          </button>
          <button
            type="button"
            onClick={() => resolveWith(true)}
            autoFocus
            className="h-9 rounded-md bg-red-600 px-3 text-sm font-medium text-white transition hover:bg-red-700"
          >
            Leave page
          </button>
        </div>
      </div>
    </div>
  );
}
