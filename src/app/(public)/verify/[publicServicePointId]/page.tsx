import { buildWalletVerificationLink } from "@/lib/verification/walletLink";

type VerificationFallbackPageProps = {
  params: Promise<{ publicServicePointId: string }>;
};

export default async function VerificationFallbackPage({ params }: VerificationFallbackPageProps) {
  const { publicServicePointId } = await params;
  const walletUrl = buildWalletVerificationLink(publicServicePointId);

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-12 text-zinc-950">
      <section className="mx-auto max-w-xl rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">UNIFY student verification</p>
        <h1 className="mt-3 text-2xl font-semibold">Continue in Student Wallet</h1>
        {walletUrl ? (
          <>
            <p className="mt-3 text-sm leading-6 text-zinc-600">
              Credential verification only runs inside the wallet. This browser page does not request or receive
              credential details.
            </p>
            <a
              className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800"
              href={walletUrl}
            >
              Open Student Wallet
            </a>
            <div className="mt-6 rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm leading-6 text-zinc-600">
              <p className="font-medium text-zinc-900">Wallet not installed?</p>
              <p className="mt-1">
                Install the official UNIFY Student Wallet for Android, then scan the service-point QR code again.
                Contact your university administrator if you do not have an installation link.
              </p>
            </div>
          </>
        ) : (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            This verification link is missing its service-point identifier. Scan the printed QR code again.
          </p>
        )}
      </section>
    </main>
  );
}
