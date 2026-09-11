/**
 * @fileoverview Surfaces newly completed wallet payments without duplicating alerts.
 * @module features/vendors/LivePaymentNotifications
 */

"use client";

import { CreditCard, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { IconButton } from "@/components/ui/IconButton";
import { formatDateTime, formatMoneyMinor } from "@/lib/formatters";
import type { LivePaymentEvent } from "@/features/vendors/LivePaymentList";

export function LivePaymentNotifications({
  branchIds = [],
  initialCursor,
}: {
  branchIds?: string[];
  initialCursor: string;
}) {
  const [queue, setQueue] = useState<LivePaymentEvent[]>([]);
  const cursor = useRef<string>(initialCursor);
  const polling = useRef(false);
  const branchIdsKey = useMemo(() => branchIds.join("\u0000"), [branchIds]);

  useEffect(() => {
    let cancelled = false;
    let controller: AbortController | null = null;
    async function poll() {
      if (cancelled || document.visibilityState !== "visible" || polling.current) return;
      polling.current = true;
      controller = new AbortController();
      try {
        const params = new URLSearchParams({ cursor: cursor.current });
        for (const branchId of branchIdsKey ? branchIdsKey.split("\u0000") : []) {
          params.append("branchId", branchId);
        }
        const response = await fetch(`/api/vendor/live-payments?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const result = await response.json() as { events: LivePaymentEvent[]; nextCursor: string };
        if (cancelled) return;
        cursor.current = result.nextCursor;
        if (result.events.length > 0) {
          setQueue((current) => {
            const known = new Set(current.map((event) => event.eventId));
            return [...current, ...result.events.filter((event) => !known.has(event.eventId))];
          });
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      } finally {
        controller = null;
        polling.current = false;
      }
    }

    void poll();
    const timer = window.setInterval(() => void poll(), 2_000);
    const onVisibility = () => { if (document.visibilityState === "visible") void poll(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      controller?.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [branchIdsKey]);

  const event = queue[0];
  if (!event) return null;

  return (
    <aside aria-live="assertive" className="fixed right-4 top-32 z-50 w-[min(23rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-4 shadow-lg" role="status">
      <div className="flex items-start gap-3">
        <CreditCard className="mt-0.5 shrink-0 text-success-fg" size={22} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-fg">Payment received</p>
          <p className="mt-2 text-lg font-semibold tabular-nums text-success-fg">
            {formatMoneyMinor(event.amountMinor, event.currency)}
          </p>
          <p className="mt-1 truncate text-sm font-medium text-fg">{event.studentName}</p>
          <p className="mt-0.5 truncate text-xs text-fg-subtle">{event.studentNumber}</p>
          <p className="mt-2 text-xs text-fg-subtle">
            {event.branchName} / {formatDateTime(event.completedAt)}
            {queue.length > 1 ? ` / ${queue.length - 1} more` : ""}
          </p>
        </div>
        <IconButton aria-label="Dismiss payment notification" onClick={() => setQueue((current) => current.slice(1))} tone="ghost" type="button"><X size={17} /></IconButton>
      </div>
    </aside>
  );
}
