import Script from "next/script";

const UNSAFE_JS_HTML_CHAR_MAP: Record<string, string> = {
  "<": "\\u003C",
  ">": "\\u003E",
  "/": "\\u002F",
  "\\": "\\\\",
  "\b": "\\b",
  "\f": "\\f",
  "\n": "\\n",
  "\r": "\\r",
  "\t": "\\t",
  "\0": "\\0",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

function escapeUnsafeChars(value: string) {
  return value.replace(/[<>\/\\\b\f\n\r\t\0\u2028\u2029]/g, (char) => UNSAFE_JS_HTML_CHAR_MAP[char] ?? char);
}

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
      <Script id="open-unify-wallet-topup-return" strategy="afterInteractive">
        {`window.setTimeout(function(){ window.location.href = ${escapeUnsafeChars(JSON.stringify(walletUrl))}; }, 350);`}
      </Script>
      <h1 className="text-2xl font-semibold">Return to UNIFY Wallet</h1>
      <p className="text-sm text-fg-muted">
        Your wallet will confirm the top-up with the server. This page does not credit funds.
      </p>
      <a className="inline-flex min-h-11 items-center justify-center rounded-md bg-black px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 dark:bg-white dark:text-black dark:hover:bg-neutral-200" href={walletUrl}>
        Open wallet
      </a>
      <p className="text-xs text-fg-muted">
        If your browser does not switch back automatically, tap Open wallet.
      </p>
    </main>
  );
}
