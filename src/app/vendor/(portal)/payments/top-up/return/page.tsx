/**
 * @fileoverview Renders the owner-only return page at `/vendor/payments/top-up/return` after Paystack checkout.
 * @module app/vendor/(portal)/payments/top-up/return/page
 */

import { notFound } from "next/navigation";

import { WalletDomainError } from "@/lib/payments/errors";
import { requireVendorOwnerContextForRender } from "@/lib/vendors/context";
import { getVendorWalletTopup, vendorWalletTopupRestoredPayments } from "@/lib/vendors/walletTopups";

import { TopUpReturnStatus } from "./TopUpReturnStatus";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function loadTopUp(vendorProfileId: string, topUpId: string) {
  try {
    return await getVendorWalletTopup(vendorProfileId, topUpId);
  } catch (error) {
    if (error instanceof WalletDomainError && error.code === "TOPUP_NOT_FOUND") notFound();
    throw error;
  }
}

/**
 * The `reference` query string Paystack appends on redirect is an untrusted
 * hint only — it is never read here. Confirmation is always resolved
 * server-side against this vendor's own stored attempt.
 */
export default async function VendorWalletTopUpReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ topUpId?: string | string[] }>;
}) {
  const { context } = await requireVendorOwnerContextForRender();
  const topUpId = firstParam((await searchParams).topUpId);
  if (!topUpId) notFound();

  const topUp = await loadTopUp(context.vendorProfileId, topUpId);
  const paymentsRestored = topUp.status === "SUCCEEDED"
    ? await vendorWalletTopupRestoredPayments(context.vendorProfileId, topUpId)
    : false;

  return (
    <div className="mx-auto max-w-md space-y-6 py-10">
      <TopUpReturnStatus
        key={topUp.status}
        paymentsRestored={paymentsRestored}
        topUp={topUp}
      />
    </div>
  );
}
