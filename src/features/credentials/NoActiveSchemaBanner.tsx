import Link from "next/link";

/**
 * Shown at the top of both issuance entry points (batch, individual) when the
 * university has no active credential schema — issuing will fail either way,
 * so surface it before the user gets into the workflow rather than after.
 */
export function NoActiveSchemaBanner() {
  return (
    <div className="rounded-md border border-warning-border bg-warning-bg px-4 py-3 text-sm text-warning-fg">
      Credential issuing requires an active schema.{" "}
      <Link className="font-medium underline underline-offset-2" href="/credentials/schemas">
        Configure credential schema
      </Link>
      .
    </div>
  );
}
