"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/formatters";

type VerificationItem = {
  id: string;
  verificationRequestId: string | null;
  checkoutId: string | null;
  servicePointName: string | null;
  status: "PENDING" | "APPROVED" | "DECLINED" | "EXPIRED" | "FAILED";
  failureCode: string | null;
  createdAt: string;
  completedAt: string | null;
  latestDeliveryStatus: "DELIVERED" | "FAILED" | null;
};

const TONE = { PENDING: "warning", APPROVED: "success", DECLINED: "danger", EXPIRED: "danger", FAILED: "danger" } as const;

export function LiveVerificationList({ initialItems }: { initialItems: VerificationItem[] }) {
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
          return { ...item, status: result.status, failureCode: result.failureCode, completedAt: result.completedAt } as VerificationItem;
        } catch {
          return item;
        }
      }));
      setItems((current) => current.map((item) => updates.find((update) => update.id === item.id) ?? item));
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [items]);

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
    <div className="divide-y divide-zinc-100">
      {items.map((verification) => (
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4" key={verification.id}>
          <div>
            <p className="text-sm font-medium text-zinc-900">{verification.checkoutId ? `Checkout ${verification.checkoutId}` : verification.servicePointName ?? "Student verification"}</p>
            <p className="text-xs text-zinc-500">{formatDateTime(verification.createdAt)}</p>
            {verification.failureCode && <p className="mt-1 text-xs text-red-600">{verification.failureCode}</p>}
          </div>
          <div className="flex items-center gap-2">
            {verification.latestDeliveryStatus === "DELIVERED" && <span className="text-xs text-emerald-700">Webhook delivered</span>}
            {verification.latestDeliveryStatus === "FAILED" && (
              <button className="inline-flex items-center gap-1 text-xs font-medium text-zinc-700" disabled={retrying === verification.id} onClick={() => retry(verification)} type="button">
                <RefreshCw className={retrying === verification.id ? "animate-spin" : ""} size={13} /> Retry webhook
              </button>
            )}
            <Badge tone={TONE[verification.status]}>{verification.status}</Badge>
          </div>
        </div>
      ))}
      {items.length === 0 && <p className="px-5 py-6 text-sm text-zinc-500">No verifications yet. Results will appear here once students start using your QR code.</p>}
    </div>
  );
}
