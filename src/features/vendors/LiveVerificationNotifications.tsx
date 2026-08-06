"use client";

import { CheckCircle2, ShieldX, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { formatDateTime } from "@/lib/formatters";

type LiveEvent = {
  eventId: string;
  branchName: string;
  status: "APPROVED" | "DECLINED" | "EXPIRED" | "FAILED";
  failureCode: string | null;
  failureReason: string | null;
  completedAt: string;
  studentName: string | null;
  studentNumber: string | null;
};

export function LiveVerificationNotifications({ initialCursor }: { initialCursor: string }) {
  const [queue, setQueue] = useState<LiveEvent[]>([]);
  const cursor = useRef<string>(initialCursor);
  const polling = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      if (cancelled || document.visibilityState !== "visible" || polling.current) return;
      polling.current = true;
      try {
        const response = await fetch(`/api/vendor/live-verifications?cursor=${encodeURIComponent(cursor.current)}`, { cache: "no-store" });
        if (!response.ok) return;
        const result = await response.json() as { events: LiveEvent[]; nextCursor: string };
        cursor.current = result.nextCursor;
        if (result.events.length > 0) {
          setQueue((current) => {
            const known = new Set(current.map((event) => event.eventId));
            return [...current, ...result.events.filter((event) => !known.has(event.eventId))];
          });
        }
      } finally {
        polling.current = false;
      }
    }
    void poll();
    const timer = window.setInterval(() => void poll(), 2_000);
    const onVisibility = () => { if (document.visibilityState === "visible") void poll(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { cancelled = true; window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisibility); };
  }, []);

  const event = queue[0];
  if (!event) return null;
  const approved = event.status === "APPROVED";
  const Icon = approved ? CheckCircle2 : ShieldX;
  return (
    <aside aria-live="assertive" className="fixed right-4 top-4 z-50 w-[min(24rem,calc(100vw-2rem))] rounded-lg border border-zinc-200 bg-white p-4 shadow-xl" role="status">
      <div className="flex items-start gap-3">
        <Icon className={approved ? "mt-0.5 shrink-0 text-emerald-600" : "mt-0.5 shrink-0 text-red-600"} size={22} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-zinc-950">Verification {approved ? "successful" : "unsuccessful"}</p>
          <p className="mt-0.5 text-sm font-medium text-zinc-700">{event.branchName}</p>
          {(event.studentName || event.studentNumber) ? <p className="mt-2 text-sm text-zinc-700">{event.studentName ?? "Student"}{event.studentNumber ? ` · ${event.studentNumber}` : ""}</p> : <p className="mt-2 text-sm text-zinc-500">Verified identity details are unavailable.</p>}
          {event.failureReason && <p className="mt-2 text-sm text-red-700">{event.failureReason} <span className="font-mono text-xs">({event.failureCode})</span></p>}
          <p className="mt-2 text-xs text-zinc-400">{formatDateTime(event.completedAt)}{queue.length > 1 ? ` · ${queue.length - 1} more` : ""}</p>
        </div>
        <button aria-label="Dismiss notification" className="grid size-8 shrink-0 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100" onClick={() => setQueue((current) => current.slice(1))} type="button"><X size={17} /></button>
      </div>
    </aside>
  );
}
