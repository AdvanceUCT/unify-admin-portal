/**
 * @fileoverview Danger alert shown while a vendor's verifications are suspended for an overdue invoice.
 * @module features/vendors/VerificationSuspensionBanner
 */

import { ShieldAlert } from "lucide-react";

const dateFormatter = new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeZone: "Africa/Johannesburg" });

/** Shared by the admin verification history page and the vendor portal; `action` is vendor-only. */
export function VerificationSuspensionBanner({
  action,
  detail,
  reason,
  suspendedAtIso,
}: {
  action?: React.ReactNode;
  detail: string;
  reason: string | null;
  suspendedAtIso: string;
}) {
  return (
    <section
      className="flex flex-col gap-3 rounded-lg border border-danger-border bg-danger-bg px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      role="alert"
    >
      <div className="flex min-w-0 items-start gap-3">
        <ShieldAlert aria-hidden="true" className="mt-0.5 shrink-0 text-danger-fg" size={18} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-fg">
            Verification suspended since {dateFormatter.format(new Date(suspendedAtIso))}
          </p>
          <p className="mt-0.5 text-sm text-danger-fg">{reason ? `${reason}. ${detail}` : detail}</p>
        </div>
      </div>
      {action}
    </section>
  );
}
