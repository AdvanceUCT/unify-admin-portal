/**
 * @fileoverview Renders the public funder return page at `/fund/return` after Paystack checkout.
 * @module app/(public)/fund/return/page
 */

import Link from "next/link";

import { WalletDomainError } from "@/lib/payments/errors";
import { getFunderTopup, type FunderTopupResult } from "@/lib/payments/topups";
import { getUniversityProfileForRender } from "@/lib/university/profile";

import { FundShell } from "../FundShell";
import { FunderTopUpStatus } from "./FunderTopUpStatus";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function loadTopUp(topUpId: string | undefined, reference: string | undefined): Promise<FunderTopupResult | null> {
  if (!topUpId || !reference) return null;
  try {
    return await getFunderTopup({ topUpId, reference });
  } catch (error) {
    if (error instanceof WalletDomainError && error.code === "TOPUP_NOT_FOUND") return null;
    throw error;
  }
}

/**
 * Paystack appends its own `reference` (and `trxref`) to the callback URL,
 * which already carries ours; both are the same value, so the first is used.
 * The pair only selects a funder attempt; it never proves payment.
 */
export default async function FunderTopUpReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ topUpId?: string | string[]; reference?: string | string[] }>;
}) {
  const params = await searchParams;
  const [profile, topUp] = await Promise.all([
    getUniversityProfileForRender(),
    loadTopUp(firstParam(params.topUpId), firstParam(params.reference)),
  ]);

  return (
    <FundShell profile={profile}>
      {topUp ? (
        <FunderTopUpStatus initial={topUp} />
      ) : (
        <section className="rounded-xl border border-border bg-surface p-6 text-center shadow-md">
          <h1 className="text-section-title text-fg">Payment not found</h1>
          <p className="mt-2 text-sm text-fg-muted">Check the link from your payment, or start a new payment.</p>
          <Link className="mt-4 inline-block text-sm font-medium text-brand-700 hover:underline" href="/fund">
            Fund a student
          </Link>
        </section>
      )}
    </FundShell>
  );
}
