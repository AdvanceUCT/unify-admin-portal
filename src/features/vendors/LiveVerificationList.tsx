/**
 * @fileoverview Shows recent verification sessions across the permitted vendor branches.
 * @module features/vendors/LiveVerificationList
 */

"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { Avatar } from "@/components/ui/Avatar";
import { StatusText } from "@/components/ui/StatusText";
import { formatDateTime } from "@/lib/formatters";

type VerificationItem = {
  id: string;
  branchId: string | null;
  verificationRequestId: string | null;
  checkoutId: string | null;
  servicePointName: string | null;
  status: "PENDING" | "APPROVED" | "DECLINED" | "EXPIRED" | "FAILED";
  isVerified: boolean | null;
  failureCode: string | null;
  failureReason: string | null;
  attributes: Record<string, string> | null;
  student: {
    id: string | null;
    name: string | null;
    university: string | null;
  };
  createdAt: string;
  completedAt: string | null;
  latestDeliveryStatus: "DELIVERED" | "FAILED" | null;
};

type LiveEvent = {
  eventId: string;
  verificationId: string;
  branchId: string | null;
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
};

const TONE = { PENDING: "warning", APPROVED: "success", DECLINED: "danger", EXPIRED: "danger", FAILED: "danger" } as const;

function itemFromLiveEvent(event: LiveEvent): VerificationItem {
  return {
    id: event.verificationId,
    branchId: event.branchId,
    verificationRequestId: null,
    checkoutId: null,
    servicePointName: event.branchName,
    status: event.status,
    isVerified: event.isVerified,
    failureCode: event.failureCode,
    failureReason: event.failureReason,
    attributes: event.attributes,
    student: event.student,
    createdAt: event.completedAt,
    completedAt: event.completedAt,
    latestDeliveryStatus: null,
  };
}

export function LiveVerificationList({
  branchId,
  initialItems,
  liveCursor,
}: {
  branchId?: string;
  initialItems: VerificationItem[];
  liveCursor?: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [retrying, setRetrying] = useState<string | null>(null);

  useEffect(() => {
    const pending = items.filter((item) => item.status === "PENDING" && item.verificationRequestId);
    if (pending.length === 0) return;

    const timer = window.setInterval(async () => {
      const updates = await Promise.all(pending.map(async (item) => {
        try {
          const response = await fetch(`/api/vendor/verifications/${encodeURIComponent(item.verificationRequestId as string)}`, { cache: "no-store" });
          if (!response.ok) return item;
          const result = await response.json();
          return {
            ...item,
            status: result.status,
            isVerified: result.isVerified,
            failureCode: result.failureCode,
            failureReason: result.failureReason,
            attributes: result.attributes,
            student: result.student,
            completedAt: result.completedAt,
          } as VerificationItem;
        } catch {
          return item;
        }
      }));
      setItems((current) => current.map((item) => updates.find((update) => update.id === item.id) ?? item));
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [items]);

  useEffect(() => {
    if (!liveCursor) return;
    let cancelled = false;
    let cursor = liveCursor;
    let polling = false;

    async function poll() {
      if (cancelled || document.visibilityState !== "visible" || polling) return;
      polling = true;
      try {
        const response = await fetch(`/api/vendor/live-verifications?cursor=${encodeURIComponent(cursor)}`, { cache: "no-store" });
        if (!response.ok) return;
        const result = await response.json() as { events: LiveEvent[]; nextCursor: string };
        cursor = result.nextCursor;
        const incoming = result.events
          .filter((event) => !branchId || event.branchId === branchId)
          .map(itemFromLiveEvent)
          .reverse();
        if (incoming.length === 0) return;
        setItems((current) => {
          const known = new Set(current.map((item) => item.id));
          const next = incoming.filter((item) => !known.has(item.id));
          return next.length > 0 ? [...next, ...current].slice(0, 20) : current;
        });
      } finally {
        polling = false;
      }
    }

    void poll();
    const timer = window.setInterval(() => void poll(), 2_000);
    const onVisibility = () => { if (document.visibilityState === "visible") void poll(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [branchId, liveCursor]);

  async function retry(item: VerificationItem) {
    if (!item.verificationRequestId) return;
    setRetrying(item.id);
    try {
      const response = await fetch(`/api/vendor/verifications/${encodeURIComponent(item.verificationRequestId)}/retry`, { method: "POST" });
      if (response.ok) {
        const result = await response.json();
        setItems((current) => current.map((currentItem) => currentItem.id === item.id ? { ...currentItem, latestDeliveryStatus: result.status ?? currentItem.latestDeliveryStatus } : currentItem));
      }
    } catch {
      // The failed delivery remains visible so the vendor can retry again.
    } finally {
      setRetrying(null);
    }
  }

  return (
    <div className="divide-y divide-border">
      {items.map((verification) => {
        const context = verification.checkoutId
          ? `Checkout ${verification.checkoutId}`
          : verification.servicePointName ?? "Student verification";
        const checkedAt = verification.completedAt ?? verification.createdAt;
        const studentName = verification.student.name ?? "Student verification";
        const studentNumber = verification.student.id ?? "Unavailable";
        const university = verification.student.university ?? "Unavailable";

        return (
        <div className="flex flex-col gap-3 px-5 py-4 transition hover:bg-surface-muted/60 sm:flex-row sm:items-center sm:justify-between" key={verification.id}>
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={studentName} />
            <div className="min-w-0">
              <p className="truncate text-body font-medium text-fg">{studentName}</p>
              <p className="mt-0.5 truncate text-xs text-fg-subtle">{studentNumber} / {university}</p>
              <p className="mt-0.5 truncate text-xs text-fg-subtle">{context} / {formatDateTime(checkedAt)}</p>
              {verification.failureReason && (
                <p className="mt-1 text-xs text-danger-fg">
                  {verification.failureReason}
                  {verification.failureCode && <span className="font-mono"> ({verification.failureCode})</span>}
                </p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3 pl-12 sm:flex-col sm:items-end sm:gap-1.5 sm:pl-0">
            <StatusText tone={TONE[verification.status]}>{verification.status}</StatusText>
            {verification.latestDeliveryStatus === "DELIVERED" && <span className="text-xs font-medium text-success-fg">Webhook delivered</span>}
            {verification.latestDeliveryStatus === "FAILED" && (
              <button className="inline-flex items-center gap-1 text-xs font-medium text-fg-muted transition hover:text-fg disabled:cursor-not-allowed disabled:opacity-60" disabled={retrying === verification.id} onClick={() => retry(verification)} type="button">
                <RefreshCw className={retrying === verification.id ? "animate-spin" : ""} size={13} /> Retry webhook
              </button>
            )}
          </div>
        </div>
        );
      })}
      {items.length === 0 && <p className="px-5 py-8 text-center text-sm text-fg-subtle">No verifications yet. Results will appear here once students start using your QR code.</p>}
    </div>
  );
}
