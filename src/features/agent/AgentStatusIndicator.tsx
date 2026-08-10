/**
 * @fileoverview Shows whether the portal can reach a ready Credo agent.
 * @module features/agent/AgentStatusIndicator
 */

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
 * Both portal layouts wrap every page, so probing the agent server-side there
 * would put a network round-trip in front of every single navigation.
 *
 * `checkHealth` defaults to the admin action so `<AgentStatusIndicator />`
 * keeps working unchanged there; the vendor layout passes its own
 * vendor-session-gated action instead, since the admin one calls
 * `requireRole(ADMIN_ROLES)` and would reject a vendor session outright.
 */
export function AgentStatusIndicator({
  checkHealth = checkAgentHealthAction,
  initialHealth,
  offlineHref = "/settings",
}: {
  checkHealth?: () => Promise<AgentHealth>;
  initialHealth?: AgentHealth;
  /** Where the "Offline" label links to for diagnostics. Pass `null` to render it as plain text. */
  offlineHref?: string | null;
}) {
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
      const next = await checkHealth();
      if (mountedRef.current) setHealth(next);
    });
  }, [checkHealth]);

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
      {!isChecking && !isOk && offlineHref ? (
        <Link
          className={cn("text-xs font-semibold underline-offset-2 hover:underline", labelClassName)}
          href={offlineHref}
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
