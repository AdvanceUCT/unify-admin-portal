/**
 * @fileoverview Surfaces newly completed vendor verifications without duplicating alerts.
 * @module features/vendors/LiveVerificationNotifications
 */

"use client";

import { CheckCircle2, ShieldX, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { IconButton } from "@/components/ui/IconButton";
import { formatDateTime } from "@/lib/formatters";

type LiveEvent = {
  eventId: string;
  branchName: string;
  status: "APPROVED" | "DECLINED" | "EXPIRED" | "FAILED";
  failureCode: string | null;
  failureReason: string | null;
  isVerified: boolean | null;
  attributes: Record<string, string> | null;
  student: {
    id: string | null;
    name: string | null;
    university: string | null;
  };
  completedAt: string;
  studentName: string | null;
  studentNumber: string | null;
  studentUniversity: string | null;
};

const NOTIFICATION_TTL_MS = 5_000;

export function LiveVerificationNotifications({
  branchIds = [],
  initialCursor,
}: {
  branchIds?: string[];
  initialCursor: string;
}) {
  const [queue, setQueue] = useState<LiveEvent[]>([]);
  const cursor = useRef<string>(initialCursor);
  const polling = useRef(false);
  const timers = useRef(new Map<string, number>());
  const branchIdsKey = useMemo(() => branchIds.join("\u0000"), [branchIds]);

  function dismiss(eventId: string) {
    const timer = timers.current.get(eventId);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(eventId);
    setQueue((current) => current.filter((event) => event.eventId !== eventId));
  }

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
        const response = await fetch(`/api/vendor/live-verifications?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const result = await response.json() as { events: LiveEvent[]; nextCursor: string };
        if (cancelled) return;
        cursor.current = result.nextCursor;
        if (result.events.length > 0) {
          setQueue((current) => {
            const known = new Set(current.map((event) => event.eventId));
            const next = result.events.filter((event) => !known.has(event.eventId)).reverse();
            return next.length > 0 ? [...next, ...current] : current;
          });
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        // Keep the cursor unchanged so the next visible poll can retry the same window.
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

  useEffect(() => {
    const activeIds = new Set(queue.map((event) => event.eventId));
    for (const event of queue) {
      if (timers.current.has(event.eventId)) continue;
      timers.current.set(
        event.eventId,
        window.setTimeout(() => dismiss(event.eventId), NOTIFICATION_TTL_MS),
      );
    }
    for (const [eventId, timer] of timers.current) {
      if (activeIds.has(eventId)) continue;
      window.clearTimeout(timer);
      timers.current.delete(eventId);
    }
  }, [queue]);

  useEffect(() => () => {
    for (const timer of timers.current.values()) window.clearTimeout(timer);
    timers.current.clear();
  }, []);

  if (queue.length === 0) return null;

  return (
    <div aria-live="assertive" className="fixed right-4 top-4 z-50 flex w-[min(23rem,calc(100vw-2rem))] flex-col gap-3" role="status">
      {queue.map((event) => {
        const approved = event.status === "APPROVED";
        const Icon = approved ? CheckCircle2 : ShieldX;
        const studentName = event.student.name ?? event.studentName;
        const studentId = event.student.id ?? event.studentNumber ?? "Unavailable";
        const studentUniversity = event.student.university ?? event.studentUniversity ?? "Unavailable";

        return (
          <aside className="rounded-xl border border-border bg-surface p-4 shadow-lg" key={event.eventId}>
            <div className="flex items-start gap-3">
              <Icon className={approved ? "mt-0.5 shrink-0 text-success-fg" : "mt-0.5 shrink-0 text-danger-fg"} size={22} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-fg">Verification {approved ? "successful" : "unsuccessful"}</p>
                {(studentName || studentId !== "Unavailable" || studentUniversity !== "Unavailable") ? (
                  <div className="mt-2">
                    <p className="truncate text-sm font-medium text-fg">{studentName ?? "Student verification"}</p>
                    <dl className="mt-1 grid gap-0.5 text-xs">
                      <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2">
                        <dt className="text-fg-subtle">Number</dt>
                        <dd className="truncate font-medium text-fg-muted">{studentId}</dd>
                      </div>
                      <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2">
                        <dt className="text-fg-subtle">University</dt>
                        <dd className="truncate font-medium text-fg-muted">{studentUniversity}</dd>
                      </div>
                    </dl>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-fg-muted">Verified identity details are unavailable.</p>
                )}
                {event.failureReason && <p className="mt-2 text-sm text-danger-fg">{event.failureReason} <span className="font-mono text-xs">({event.failureCode})</span></p>}
                <p className="mt-2 text-xs text-fg-subtle">{event.branchName} / {formatDateTime(event.completedAt)}</p>
              </div>
              <IconButton aria-label="Dismiss notification" onClick={() => dismiss(event.eventId)} tone="ghost" type="button"><X size={17} /></IconButton>
            </div>
          </aside>
        );
      })}
    </div>
  );
}
