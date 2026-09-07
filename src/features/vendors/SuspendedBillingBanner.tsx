/**
 * @fileoverview Warns a vendor whose verification access is suspended for non-payment.
 * @module features/vendors/SuspendedBillingBanner
 */

import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export function SuspendedBillingBanner() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger-border bg-danger-bg px-5 py-4">
      <div className="flex items-start gap-3">
        <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0 text-danger-fg" />
        <div>
          <p className="font-medium text-danger-fg">Verification access suspended</p>
          <p className="mt-0.5 text-sm text-danger-fg">
            Your account has an unpaid invoice. Student credential verification will not work until
            it&apos;s settled.
          </p>
        </div>
      </div>
      <Link
        className="inline-flex h-9 shrink-0 items-center justify-center rounded-md bg-danger-fg px-4 text-sm font-medium text-white transition hover:opacity-90"
        href="/vendor/invoices"
      >
        Pay now
      </Link>
    </div>
  );
}
