/**
 * @fileoverview Renders the public portal page at `/activate`.
 * @module app/(public)/activate/page
 */

import { buildWalletDeepLink } from "@/lib/api/activationLinks";

type ActivatePageProps = {
  searchParams: Promise<{
    token?: string | string[];
  }>;
};

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ActivatePage({ searchParams }: ActivatePageProps) {
  const params = await searchParams;
  const token = firstParam(params.token)?.trim();
  const walletUrl = token ? buildWalletDeepLink(token) : undefined;

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-12 text-zinc-950">
      <section className="mx-auto max-w-xl rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">UNIFY credential activation</p>
        <h1 className="mt-3 text-2xl font-semibold">Open this offer in Student Wallet</h1>
        {walletUrl ? (
          <>
            <p className="mt-3 text-sm leading-6 text-zinc-600">
              If the wallet is installed, Android can open this offer directly. You can also use the button below.
            </p>
            <a
              className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800"
              href={walletUrl}
            >
              Open Student Wallet
            </a>
            <p className="mt-5 break-all rounded-md border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs text-zinc-600">
              {walletUrl}
            </p>
          </>
        ) : (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            This activation link is missing its token. Ask the issuer to send a new offer.
          </p>
        )}
      </section>
    </main>
  );
}
