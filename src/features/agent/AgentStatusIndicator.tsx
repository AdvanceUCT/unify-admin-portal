"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";

import { checkAgentHealthAction } from "@/app/(admin)/settings/actions";
import type { AgentHealth } from "@/lib/agentClient";
import { cn } from "@/lib/cn";

const POLL_INTERVAL_MS = 30_000;

function formatCheckedAt(checkedAt: string) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(checkedAt).getTime()) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}m ago`;
}

/**
 * Live Identity Agent Service status, sized to sit in the portal header so the
 * connection is visible from every page rather than only the dashboard.
 *
 * It fetches its own state on mount instead of taking it from a server render.
 * The admin layout wraps every page, so probing the agent server-side there
 * would put a network round-trip in front of every single navigation.
 */
export function AgentStatusIndicator({ initialHealth }: { initialHealth?: AgentHealth }) {
  const [health, setHealth] = useState<AgentHealth | null>(initialHealth ?? null);
  const [isPending, startTransition] = useTransition();
  const [, forceTick] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(() => {
    startTransition(async () => {
      const next = await checkAgentHealthAction();
      if (mountedRef.current) setHealth(next);
    });
  }, []);

  useEffect(() => {
    if (!initialHealth) refresh();

    const poll = setInterval(refresh, POLL_INTERVAL_MS);
    // Keeps the "checked Xs ago" tooltip ticking between polls.
    const clock = setInterval(() => forceTick((n) => n + 1), 5_000);

    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [initialHealth, refresh]);

  const isChecking = health === null;
  const isOk = health?.ok ?? false;

  const shellClassName = isChecking
    ? "border-border bg-surface"
    : isOk
      ? "border-success-border bg-success-bg"
      : "border-danger-border bg-danger-bg";

  const dotClassName = isChecking
    ? "bg-fg-subtle"
    : isOk
      ? "bg-success-fg"
      : "bg-danger-fg";

  const label = isChecking ? "Checking…" : isOk ? "Connected" : "Offline";
  const labelClassName = isChecking
    ? "text-fg-subtle"
    : isOk
      ? "text-success-fg"
      : "text-danger-fg";

  const detail = health
    ? `${health.ok ? `Ledger ${health.reachable ? "reachable" : "unreachable"}` : health.error} · Checked ${formatCheckedAt(health.checkedAt)}`
    : "Checking agent service connection";

  return (
    <div
      className={cn(
        "inline-flex shrink-0 items-center gap-2 rounded-full border py-1 pl-2.5 pr-1",
        shellClassName,
      )}
      title={detail}
    >
      <span className="relative flex size-2">
        {isOk ? (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-success-fg opacity-60" />
        ) : null}
        <span className={cn("relative inline-flex size-2 rounded-full", dotClassName)} />
      </span>

      <span className="hidden text-xs font-medium text-fg-subtle sm:inline">Agent</span>

      {/* When it's down, the label becomes the route to the diagnostics. */}
      {!isChecking && !isOk ? (
        <Link
          className={cn("text-xs font-semibold underline-offset-2 hover:underline", labelClassName)}
          href="/settings"
        >
          {label}
        </Link>
      ) : (
        <span className={cn("text-xs font-semibold", labelClassName)}>{label}</span>
      )}

      <button
        aria-label="Refresh agent connection status"
        className="grid size-6 shrink-0 place-items-center rounded-full text-fg-subtle transition hover:bg-surface-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
        disabled={isPending}
        onClick={refresh}
        type="button"
      >
        <RefreshCw className={cn("size-3.5", isPending && "animate-spin")} aria-hidden="true" />
      </button>
    </div>
  );
}
