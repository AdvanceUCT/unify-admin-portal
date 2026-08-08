"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";

import type { AgentHealth } from "@/lib/agentClient";
import { checkAgentHealthAction } from "./settings/actions";

const POLL_INTERVAL_MS = 30_000;

function formatCheckedAt(checkedAt: string) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(checkedAt).getTime()) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}m ago`;
}

/**
 * Small live-status pill for the Identity Agent Service connection, meant to sit in a
 * page corner (e.g. next to a SectionHeader) rather than as a grid card.
 */
export function AgentConnectionWidget({ initialHealth }: { initialHealth: AgentHealth }) {
  const [health, setHealth] = useState(initialHealth);
  const [isPending, startTransition] = useTransition();
  const [, forceTick] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const poll = setInterval(() => {
      startTransition(async () => {
        const next = await checkAgentHealthAction();
        if (mountedRef.current) setHealth(next);
      });
    }, POLL_INTERVAL_MS);

    // Keep the "checked Xs ago" tooltip ticking between polls.
    const clock = setInterval(() => forceTick((n) => n + 1), 5_000);

    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, []);

  function handleRefresh() {
    startTransition(async () => {
      const next = await checkAgentHealthAction();
      if (mountedRef.current) setHealth(next);
    });
  }

  const isOk = health.ok;
  const detail = isOk ? `Ledger ${health.reachable ? "reachable" : "unreachable"}` : health.error;

  return (
    <div
      className="inline-flex shrink-0 items-center gap-2 rounded-full border border-zinc-200 bg-white py-1.5 pl-3 pr-1.5 shadow-sm"
      title={`${detail} · Checked ${formatCheckedAt(health.checkedAt)}`}
    >
      <span className="relative flex size-2">
        {isOk ? (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        ) : null}
        <span className={`relative inline-flex size-2 rounded-full ${isOk ? "bg-emerald-500" : "bg-rose-500"}`} />
      </span>
      <span className="text-xs font-medium text-zinc-500">Agent service</span>
      <span className={`text-xs font-semibold ${isOk ? "text-emerald-700" : "text-rose-700"}`}>
        {isOk ? "Connected" : "Offline"}
      </span>
      <button
        aria-label="Refresh agent connection status"
        className="grid size-6 shrink-0 place-items-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={isPending}
        onClick={handleRefresh}
        type="button"
      >
        <RefreshCw className={`size-3.5 ${isPending ? "animate-spin" : ""}`} aria-hidden="true" />
      </button>
    </div>
  );
}
