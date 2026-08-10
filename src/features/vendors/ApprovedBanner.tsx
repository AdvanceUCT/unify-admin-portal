/**
 * @fileoverview Shows the approved-vendor state and a direct link to the vendor portal.
 * @module features/vendors/ApprovedBanner
 */

"use client";

import { CheckCircle2, X } from "lucide-react";
import { useEffect, useState } from "react";

import { IconButton } from "@/components/ui/IconButton";

function dismissKey(vendorId: string) {
  return `vendor-approved-banner-dismissed:${vendorId}`;
}

/**
 * Dismissal is remembered per vendor via localStorage rather than session
 * state, so it stays closed across visits instead of reappearing on every
 * page load — but it defaults to visible on first paint (flipped in an
 * effect) since localStorage isn't available during SSR.
 */
export function ApprovedBanner({ message, vendorId }: { message: string; vendorId: string }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable client-side, after mount
    if (window.localStorage.getItem(dismissKey(vendorId)) === "1") setVisible(false);
  }, [vendorId]);

  if (!visible) return null;

  return (
    <div className="flex items-start gap-3 rounded-xl border border-success-border bg-success-bg p-4 shadow-md">
      <CheckCircle2 className="mt-0.5 shrink-0 text-success-fg" size={20} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-success-fg">Verifier application approved</p>
        <p className="mt-1 text-sm text-success-fg">{message}</p>
      </div>
      <IconButton
        aria-label="Dismiss"
        className="border-transparent bg-transparent text-success-fg hover:bg-success-border/40"
        onClick={() => {
          window.localStorage.setItem(dismissKey(vendorId), "1");
          setVisible(false);
        }}
        tone="ghost"
      >
        <X size={16} />
      </IconButton>
    </div>
  );
}
