"use client";

import { useState } from "react";
import { runIssuanceSetupAction } from "@/app/(auth)/setup/actions";

const attributes = [
  "studentNumber",
  "firstName",
  "lastName",
  "faculty",
  "year",
];

export function IssuanceSetupStep({
  onComplete,
}: {
  onComplete: () => void;
}) {
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSetup() {
    setError(null);
    setIsWorking(true);
    try {
      const result = await runIssuanceSetupAction();
      if (!result.ok) {
        setError(result.error ?? "Issuance setup failed.");
        return;
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
        {isWorking ? "Working" : "Run setup"}
      </button>
    </div>
  );
}
