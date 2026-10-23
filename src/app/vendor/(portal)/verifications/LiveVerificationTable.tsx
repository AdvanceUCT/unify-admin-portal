/**
 * @fileoverview Renders the live-updating verification events table used by `/vendor/verifications`.
 * @module app/vendor/(portal)/verifications/LiveVerificationTable
 */

"use client";

import { useEffect, useState } from "react";

import { StatusText } from "@/components/ui/StatusText";
import { formatDateTime, formatMoneyMinor } from "@/lib/formatters";
import type { VendorVerificationEvent, VendorVerificationEventFilters } from "@/lib/vendors/verifications";

const TONE = { PENDING: "warning", APPROVED: "success", DECLINED: "danger", EXPIRED: "danger", FAILED: "danger" } as const;

function liveEventsHref(filters: VendorVerificationEventFilters, cursor: string) {
  const params = new URLSearchParams({ cursor });
  if (filters.query) params.set("q", filters.query);
  if (filters.university) params.set("university", filters.university);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.branchId) params.set("branchId", filters.branchId);
  if (filters.source) params.set("source", filters.source);
  return `/api/vendor/live-verification-events?${params.toString()}`;
}

export function LiveVerificationTable({
  filters,
  initialEvents,
  liveCursor,
}: {
  filters: VendorVerificationEventFilters;
  initialEvents: VendorVerificationEvent[];
  liveCursor?: string;
}) {
  const [events, setEvents] = useState(initialEvents);

  useEffect(() => {
    if (!liveCursor) return;
    let cancelled = false;
    let controller: AbortController | null = null;
    let cursor = liveCursor;
    let polling = false;

    async function poll() {
      if (cancelled || document.visibilityState !== "visible" || polling) return;
      polling = true;
      controller = new AbortController();
      try {
        const response = await fetch(liveEventsHref(filters, cursor), { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const result = await response.json() as { events: VendorVerificationEvent[]; nextCursor: string };
        if (cancelled) return;
        cursor = result.nextCursor;
        if (result.events.length === 0) return;
        setEvents((current) => {
          const incoming = new Map(result.events.map((event) => [event.id, event]));
          // A row already shown (e.g. pending when the page loaded) is updated in place, not duplicated.
          const updated = current.map((event) => incoming.get(event.id) ?? event);
          const known = new Set(current.map((event) => event.id));
          const added = result.events.filter((event) => !known.has(event.id)).reverse();
          return [...added, ...updated];
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        // Keep the cursor unchanged so the next visible poll can retry the same window.
      } finally {
        controller = null;
        polling = false;
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
  }, [filters, liveCursor]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[60rem] text-center text-body">
        <thead className="border-b border-border bg-surface-muted/60">
          <tr className="whitespace-nowrap text-caption uppercase tracking-wide text-fg-subtle">
            <th className="px-4 py-3 font-medium">Completed</th>
            <th className="px-4 py-3 font-medium">Branch</th>
            <th className="px-4 py-3 font-medium">Source</th>
            <th className="px-4 py-3 font-medium">Student</th>
            <th className="px-4 py-3 font-medium">Student number</th>
            <th className="px-4 py-3 font-medium">University</th>
            <th className="px-4 py-3 font-medium">Verification</th>
            <th className="px-4 py-3 font-medium">Price</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {events.map((event) => {
            const studentName = event.student.name ?? "Student verification";
            const studentNumber = event.student.id ?? "Unavailable";
            const university = event.student.university ?? "Unavailable";
            const price = event.billing.status === "BILLABLE"
              ? formatMoneyMinor(event.billing.feeMinor, event.billing.currency)
              : "Not billable";

            return (
              <tr className="align-middle transition hover:bg-surface-muted/60" key={event.id}>
                <td className="whitespace-nowrap px-4 py-3 text-fg-muted">
                  {formatDateTime(event.completedAt ?? event.createdAt)}
                </td>
                <td className="px-4 py-3 font-medium text-fg">{event.branchName}</td>
                <td className="px-4 py-3 text-fg-muted">{event.source === "api" ? "Website/API" : "QR"}</td>
                <td className="px-4 py-3 font-medium text-fg">{studentName}</td>
                <td className="px-4 py-3 text-fg-muted">{studentNumber}</td>
                <td className="px-4 py-3 text-fg-muted">{university}</td>
                <td className="px-4 py-3">
                  <StatusText tone={TONE[event.status]}>{event.status}</StatusText>
                  {event.failureReason && (
                    <p className="mt-1 max-w-48 text-xs text-danger-fg">
                      {event.failureReason}
                      {event.failureCode && <span className="font-mono"> ({event.failureCode})</span>}
                    </p>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-medium tabular-nums text-fg">{price}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {events.length === 0 && <p className="px-5 py-8 text-center text-sm text-fg-subtle">No verification events match these filters.</p>}
    </div>
  );
}
