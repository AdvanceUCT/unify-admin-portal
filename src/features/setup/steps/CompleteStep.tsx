"use client";

import Link from "next/link";

export function CompleteStep({
  issuerDid,
  schemaId,
  credentialDefinitionId,
}: {
  issuerDid: string;
  schemaId: string;
  credentialDefinitionId: string;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Setup complete</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Issuance is now enabled for your university.
        </p>
      </div>

      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        All onboarding steps finished successfully.
      </div>

      <div className="grid gap-3 rounded-md border border-zinc-200 bg-white p-4 text-sm">
        <div>
          <p className="text-zinc-500">Issuer DID</p>
          <p className="mt-1 break-all font-medium text-zinc-900">
            {issuerDid || "Not available"}
          </p>
        </div>
        <div>
          <p className="text-zinc-500">Schema ID</p>
          <p className="mt-1 break-all font-medium text-zinc-900">
            {schemaId || "Not available"}
          </p>
        </div>
        <div>
          <p className="text-zinc-500">Credential definition ID</p>
          <p className="mt-1 break-all font-medium text-zinc-900">
            {credentialDefinitionId || "Not available"}
          </p>
        </div>
      </div>

      <Link
        className="inline-flex h-10 items-center rounded-md bg-zinc-950 px-4 text-sm font-medium !text-white transition hover:bg-zinc-800"
        href="/"
      >
        Go to dashboard
      </Link>
    </div>
  );
}
