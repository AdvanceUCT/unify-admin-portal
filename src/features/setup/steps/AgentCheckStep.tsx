"use client";

import { useEffect, useState } from "react";
import { checkAgentStatusAction } from "@/app/(auth)/setup/actions";

type StatusState =
  | { state: "checking" }
  | { state: "ready" }
  | { state: "error"; message: string };

export function AgentCheckStep({ onComplete }: { onComplete: () => void }) {
  const [status, setStatus] = useState<StatusState>({ state: "checking" });

  async function runCheck() {
    setStatus({ state: "checking" });
    const result = await checkAgentStatusAction();
    if (result.reachable) {
      setStatus({ state: "ready" });
    } else {
      setStatus({
        state: "error",
        message: result.error ?? "Ledger is not reachable.",
      });
    }
  }

  useEffect(() => {
    void runCheck();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Agent health check</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Confirm the Identity Agent Service can reach the ledger before
          continuing.
        </p>
      </div>

      <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
        {status.state === "checking" ? (
          <p className="text-sm text-zinc-600">Checking ledger status...</p>
        ) : null}
        {status.state === "ready" ? (
          <p className="text-sm font-medium text-emerald-700">
            Ledger reachable. You can continue.
          </p>
        ) : null}
        {status.state === "error" ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-amber-700">
              Ledger unreachable.
            </p>
            <p className="text-sm text-zinc-600">{status.message}</p>
            <button
              className="h-9 rounded-md border border-zinc-300 px-3 text-sm text-zinc-700 transition hover:bg-white"
              onClick={runCheck}
              type="button"
            >
              Retry
            </button>
          </div>
        ) : null}
      </div>

      <button
        className="h-10 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
        disabled={status.state !== "ready"}
        onClick={onComplete}
        type="button"
      >
        Continue
      </button>
    </div>
  );
}
