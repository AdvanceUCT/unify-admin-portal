"use client";

import { useState } from "react";
import { createOrGetDidAction } from "@/app/(auth)/setup/actions";

export function DidStep({
  name,
  onComplete,
}: {
  name: string;
  onComplete: () => void;
}) {
  const [did, setDid] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreateDid() {
    setError(null);
    setIsWorking(true);
    try {
      const result = await createOrGetDidAction();
      setDid(result.did);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create DID.");
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Issuer DID</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Create the university issuer DID that will anchor credentials on the
          ledger.
        </p>
      </div>

      <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
        <p className="text-sm text-zinc-600">Alias (university name)</p>
        <p className="mt-1 text-sm font-medium text-zinc-950">
          {name || "(no name set)"}
        </p>
      </div>

      {did ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm text-emerald-800">Issuer DID created</p>
          <p className="mt-1 break-all text-sm font-medium text-emerald-900">
            {did}
          </p>
        </div>
      ) : null}

      {error ? <p className="text-sm text-amber-700">{error}</p> : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          className="h-10 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
          disabled={isWorking}
          onClick={handleCreateDid}
          type="button"
        >
          {isWorking ? "Creating" : "Create DID"}
        </button>
        <button
          className="h-10 rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed"
          disabled={!did}
          onClick={onComplete}
          type="button"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
