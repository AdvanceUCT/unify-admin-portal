"use client";

import { useState, useTransition } from "react";

import { SettingsField } from "./SettingsCard";
import { testAgentConnectionAction } from "./actions";

type ConnectionResult = Awaited<ReturnType<typeof testAgentConnectionAction>>;

export function AgentConnectionCard({
  apiKeyStatus,
  serviceUrlDisplay,
}: {
  apiKeyStatus: "Configured" | "Not set";
  serviceUrlDisplay: string;
}) {
  const [result, setResult] = useState<ConnectionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleTestConnection() {
    startTransition(async () => {
      const next = await testAgentConnectionAction();
      setResult(next);
    });
  }

  return (
    <div>
      <div className="divide-y divide-zinc-100">
        <SettingsField label="Agent service URL" value={serviceUrlDisplay} />
        <SettingsField label="Agent API key" value={apiKeyStatus} />
      </div>

      <div className="mt-4 flex items-center gap-3 border-t border-zinc-100 pt-4">
        <button
          className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isPending}
          onClick={handleTestConnection}
          type="button"
        >
          {isPending ? "Testing..." : "Test connection"}
        </button>

        {result ? (
          <div className="flex items-center gap-2 text-sm">
            <span
              aria-hidden="true"
              className={`size-2.5 rounded-full ${result.ok ? "bg-emerald-500" : "bg-rose-500"}`}
            />
            <span className={result.ok ? "text-emerald-700" : "text-rose-700"}>
              {result.ok ? `Reachable (${result.status})` : result.error}
            </span>
            <span className="text-zinc-400">
              &middot; Checked {new Date(result.checkedAt).toLocaleString()}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
