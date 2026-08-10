/**
 * @fileoverview Provides the shared Dialog UI primitive used across portal screens.
 * @module components/ui/Dialog
 */

"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

import { IconButton } from "@/components/ui/IconButton";

/**
 * Small centered modal for showing a single piece of detail on demand (e.g. a
 * decision note that doesn't deserve a permanent table column). Follows the
 * same overlay pattern as UnsavedChangesDialogProvider — click backdrop or
 * Escape to close, focus moves to the close button on open — but tokenized so
 * it fits any portal accent, and generic rather than tied to one flow.
 */
export function Dialog({
  children,
  isOpen,
  onClose,
  title,
}: {
  children: React.ReactNode;
  isOpen: boolean;
  onClose: () => void;
  title: string;
}) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/50 px-4"
      onClick={onClose}
    >
      <div
        aria-labelledby="dialog-title"
        aria-modal="true"
        className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-section-title text-fg" id="dialog-title">
            {title}
          </h2>
          <IconButton aria-label="Close" onClick={onClose} ref={closeButtonRef} tone="ghost">
            <X aria-hidden="true" size={18} />
          </IconButton>
        </div>
        <div className="mt-3 text-body text-fg-muted">{children}</div>
      </div>
    </div>
  );
}
