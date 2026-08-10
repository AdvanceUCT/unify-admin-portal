/**
 * @fileoverview Renders the public portal page at `/verify/checkout/[verificationRequestId]`.
 * @module app/(public)/verify/checkout/[verificationRequestId]/page
 */

import { buildWalletCheckoutVerificationLink } from "@/lib/verification/walletLink";

type CheckoutVerificationFallbackPageProps = {
  params: Promise<{ verificationRequestId: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
};

export default async function CheckoutVerificationFallbackPage({
  params,
  searchParams,
}: CheckoutVerificationFallbackPageProps) {
  const [{ verificationRequestId }, query] = await Promise.all([params, searchParams]);
  const claimToken = Array.isArray(query.token) ? query.token[0] : query.token;
  const walletUrl = claimToken
    ? buildWalletCheckoutVerificationLink(verificationRequestId, claimToken)
    : undefined;

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-12 text-zinc-950">
      <section className="mx-auto max-w-xl rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">UNIFY checkout verification</p>
        <h1 className="mt-3 text-2xl font-semibold">Continue in Student Wallet</h1>
        {walletUrl ? (
          <>
            <p className="mt-3 text-sm leading-6 text-zinc-600">
              Review and approve the requested credential values in the wallet. This browser page does not request
              or receive credential details.
            </p>
            <a
              className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800"
              href={walletUrl}
            >
              Open Student Wallet
            </a>
          </>
        ) : (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            This checkout verification link is invalid or incomplete. Return to the checkout and request a new one.
          </p>
        )}
      </section>
    </main>
  );
}
