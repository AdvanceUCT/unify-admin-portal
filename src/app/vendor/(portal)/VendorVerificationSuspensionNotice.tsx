/**
 * @fileoverview Vendor portal suspension banner that adapts to the invoice pages it appears on.
 * @module app/vendor/(portal)/VendorVerificationSuspensionNotice
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { VerificationSuspensionBanner } from "@/features/vendors/VerificationSuspensionBanner";

const INVOICES_PATH = "/vendor/invoices";
// Invoice detail pages render their own notice, so an overdue invoice is not flagged twice.
const INVOICE_DETAIL_PATH = /^\/vendor\/invoices\/[^/]+$/;

/** Shown on every vendor page while verification is suspended for an overdue invoice. */
export function VendorVerificationSuspensionNotice({
  canPayInvoices,
  className,
  reason,
  suspendedAtIso,
}: {
  canPayInvoices: boolean;
  className?: string;
  reason: string | null;
  suspendedAtIso: string;
}) {
  const pathname = usePathname();
  if (INVOICE_DETAIL_PATH.test(pathname)) return null;

  return (
    <div className={className}>
      <VerificationSuspensionNoticeBanner
        canPayInvoices={canPayInvoices}
        reason={reason}
        showInvoicesLink={pathname !== INVOICES_PATH}
        suspendedAtIso={suspendedAtIso}
      />
    </div>
  );
}

/** The banner itself, also rendered by an invoice detail page for an invoice that is not overdue. */
export function VerificationSuspensionNoticeBanner({
  canPayInvoices,
  reason,
  showInvoicesLink = true,
  suspendedAtIso,
}: {
  canPayInvoices: boolean;
  reason: string | null;
  showInvoicesLink?: boolean;
  suspendedAtIso: string;
}) {
  return (
    <VerificationSuspensionBanner
      action={
        canPayInvoices && showInvoicesLink ? (
          <Link
            className="inline-flex h-8 shrink-0 items-center self-start rounded-md bg-brand-600 px-3 text-sm font-medium text-white transition hover:bg-brand-700 sm:self-auto"
            href={INVOICES_PATH}
          >
            View invoices
          </Link>
        ) : undefined
      }
      detail={
        canPayInvoices
          ? "Students cannot be verified at any of your branches. Pay your overdue invoices to restore verification."
          : "Students cannot be verified at any branch. Ask the account owner to pay the overdue invoices."
      }
      reason={reason}
      suspendedAtIso={suspendedAtIso}
    />
  );
}
