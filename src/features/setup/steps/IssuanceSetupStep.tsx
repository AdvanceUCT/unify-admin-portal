"use client";

import { useState } from "react";
import {
  retryRevocationAction,
  runIssuanceSetupAction,
} from "@/app/(auth)/setup/actions";

const attributes = [
  "studentNumber",
  "firstName",
  "lastName",
  "faculty",
  "year",
];

export function IssuanceSetupStep({
  retryMode,
  onComplete,
}: {
  retryMode: boolean;
  onComplete: () => void;
}) {
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSetup() {
    setError(null);
    setIsWorking(true);
    try {
      if (retryMode) {
        await retryRevocationAction();
      } else {
        await runIssuanceSetupAction();
      }
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Issuance setup failed.");
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Issuance setup</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Anchor the student identity schema and credential definition on the
          ledger.
        </p>
      </div>

      {retryMode ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Schema and credential definition were anchored successfully, but the
          revocation registry needs to be completed. Retry to finish the setup.
        </div>
      ) : null}

      <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
        <p className="text-sm font-medium text-zinc-700">Schema attributes</p>
        <ul className="mt-3 grid gap-2 text-sm text-zinc-600 sm:grid-cols-2">
          {attributes.map((attribute) => (
            <li
              key={attribute}
              className="rounded-md border border-zinc-200 bg-white px-3 py-2"
            >
              {attribute}
            </li>
          ))}
        </ul>
      </div>

      {error ? <p className="text-sm text-amber-700">{error}</p> : null}

      <button
        className="h-10 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
        disabled={isWorking}
        onClick={handleSetup}
        type="button"
      >
        {isWorking ? "Working" : retryMode ? "Retry revocation" : "Run setup"}
      </button>
    </div>
  );
}
