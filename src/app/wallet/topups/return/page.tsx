type Props = {
  searchParams: Promise<{ topUpId?: string; reference?: string }>;
};

export default async function WalletTopupReturnPage({ searchParams }: Props) {
  const { topUpId } = await searchParams;
  const walletUrl = topUpId
    ? `unifywallet://topup-return?topUpId=${encodeURIComponent(topUpId)}`
    : "unifywallet://topup-return";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">Return to UNIFY Wallet</h1>
      <p className="text-sm text-fg-muted">
        Your wallet will confirm the top-up with the server. This page does not credit funds.
      </p>
      <a className="rounded-md bg-fg px-4 py-2 text-sm font-medium text-bg" href={walletUrl}>
        Open wallet
      </a>
    </main>
  );
}
