"use client";

import { useState } from "react";
import { runIssuanceSetupAction } from "@/app/(auth)/setup/actions";
import { SchemaAttributesField } from "@/components/schema/SchemaAttributesField";

export function IssuanceSetupStep({
  onComplete,
}: {
  onComplete: () => void;
}) {
  const [schemaName, setSchemaName] = useState("StudentIdentity");
  const [schemaVersion, setSchemaVersion] = useState("1.0");
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsWorking(true);
    try {
      const formData = new FormData(event.currentTarget);
      await runIssuanceSetupAction(formData);
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Issuance setup failed.");
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <div>
        <h2 className="text-lg font-semibold">Issuance setup</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Define the credential schema for your institution, then anchor it
          and a credential definition on the ledger.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          <span className="font-medium text-zinc-700">Schema name</span>
          <input
            className="mt-2 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm focus:border-zinc-500 focus:outline-none"
            name="schemaName"
            onChange={(event) => setSchemaName(event.target.value)}
            placeholder="StudentIdentity"
            required
            value={schemaName}
          />
        </label>
        <label className="text-sm">
          <span className="font-medium text-zinc-700">Version</span>
          <input
            className="mt-2 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm focus:border-zinc-500 focus:outline-none"
            name="schemaVersion"
            onChange={(event) => setSchemaVersion(event.target.value)}
            placeholder="1.0"
            required
            value={schemaVersion}
          />
        </label>
      </div>

      <div>
        <span className="text-sm font-medium text-zinc-700">
          Schema fields
        </span>
        <p className="mt-1 text-xs text-zinc-500">
          These become the fields captured on every credential issued under
          this schema.
        </p>
        <div className="mt-2">
          <SchemaAttributesField name="attributes" />
        </div>
      </div>

      {error ? <p className="text-sm text-amber-700">{error}</p> : null}

      <button
        className="h-10 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
        disabled={isWorking}
        type="submit"
      >
        {isWorking ? "Working" : "Run setup"}
      </button>
    </form>
  );
}
