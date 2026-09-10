/**
 * @fileoverview Prompts admins to finish payment-services setup once university setup completes.
 * @module features/payments/PaymentSetupPrompt
 */

"use client";

import Link from "next/link";
import { Wallet, X } from "lucide-react";
import { useEffect, useState } from "react";

import { IconButton } from "@/components/ui/IconButton";

function dismissKey(universityId: string) {
  return `payment-setup-prompt-dismissed:${universityId}`;
}

/**
 * Dismissal is remembered per university via localStorage, same pattern as
 * ApprovedBanner — defaults visible, flipped off in an effect since
 * localStorage isn't available during SSR.
 */
export function PaymentSetupPrompt({ universityId }: { universityId: string }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable client-side, after mount
    if (window.localStorage.getItem(dismissKey(universityId)) === "1") setVisible(false);
  }, [universityId]);

  if (!visible) return null;

  return (
    <div className="flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50 p-4 shadow-md">
      <Wallet className="mt-0.5 shrink-0 text-brand-700" size={20} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-brand-700">Set up payment services</p>
        <p className="mt-1 text-sm text-brand-700">
          Enable Paystack-backed wallet payments so students can pre-load funds and on-campus
          vendors can accept them.{" "}
          <Link className="underline hover:no-underline" href="/payments/setup">
            Go to Payments
          </Link>
        </p>
      </div>
      <IconButton
        aria-label="Dismiss"
        className="border-transparent bg-transparent text-brand-700 hover:bg-brand-100"
        onClick={() => {
          window.localStorage.setItem(dismissKey(universityId), "1");
          setVisible(false);
        }}
        tone="ghost"
      >
        <X size={16} />
      </IconButton>
    </div>
  );
}
