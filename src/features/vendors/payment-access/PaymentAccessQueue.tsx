/**
 * @fileoverview Admin queue of branch payment access requests with search and status filters.
 * @module features/vendors/payment-access/PaymentAccessQueue
 */

"use client";

import { Eye, MapPin } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { accessInput } from "./styles";

export type AccessQueueItem = { branchId: string; branchName: string; companyName: string; status: string; requestLabel: string; submittedAt: string | null; needsReconfirmation: boolean; paused: boolean };

const STATUS_OPTIONS = [
  { value: "PENDING", label: "In review" },
  { value: "CHANGES", label: "Needs confirmation" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Not approved" },
  { value: "REVOKED", label: "Revoked" },
  { value: "ALL", label: "All requests" },
];

const labelClassName = "grid gap-1 text-xs font-medium text-fg-muted";

function statusTone(item: AccessQueueItem) {
  if (item.needsReconfirmation) return "warning" as const;
  if (item.status === "APPROVED") return "success" as const;
  if (item.status === "REJECTED" || item.status === "REVOKED") return "danger" as const;
  return "warning" as const;
}

function matchesStatus(item: AccessQueueItem, status: string) {
  if (status === "ALL") return true;
  if (status === "CHANGES") return item.needsReconfirmation;
  return item.status === status;
}

export function PaymentAccessQueue({ items, now }: { items: AccessQueueItem[]; now: string }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("PENDING");
  const shown = items.filter((item) =>
    `${item.companyName} ${item.branchName}`.toLowerCase().includes(query.toLowerCase()) && matchesStatus(item, status),
  );
  const statusLabel = STATUS_OPTIONS.find((option) => option.value === status)?.label ?? "Requests";

  function age(date: string | null) {
    if (!date) return "Not submitted";
    const hours = Math.max(0, Math.floor((new Date(now).getTime() - new Date(date).getTime()) / 3600000));
    const relative = hours < 1 ? "less than an hour ago" : hours < 24 ? `${hours} hour${hours === 1 ? "" : "s"} ago` : `${Math.floor(hours / 24)} days ago`;
    return `Submitted ${relative}`;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-surface p-4 shadow-md">
        <div className="grid gap-3 sm:grid-cols-[minmax(14rem,1fr)_minmax(10rem,14rem)]">
          <label className={labelClassName}>
            Search vendors or branches
            <input className={accessInput} onChange={(event) => setQuery(event.target.value)} placeholder="Vendor or branch name" type="search" value={query} />
          </label>
          <label className={labelClassName}>
            Request status
            <select className={accessInput} onChange={(event) => setStatus(event.target.value)} value={status}>
              {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>
      </section>

      <div>
        <h2 className="mb-3 text-caption font-medium uppercase tracking-wide text-fg-subtle" role="status">
          {statusLabel} ({shown.length})
        </h2>
        <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
          <div className="divide-y divide-border">
            {shown.map((item) => (
              <div className="p-5" key={item.branchId}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 flex-1 gap-4">
                    <Avatar className="mt-0.5" name={item.companyName} size="lg" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-section-title text-fg">{item.companyName}</h3>
                        <Badge tone={statusTone(item)}>{item.requestLabel}</Badge>
                        {item.paused ? <Badge tone="warning">Payments paused</Badge> : null}
                      </div>
                      <p className="mt-0.5 flex items-center gap-1.5 text-sm text-fg-subtle">
                        <MapPin aria-hidden className="size-3.5 shrink-0" />
                        {item.branchName}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-start gap-3 lg:items-end">
                    <p className="text-xs text-fg-subtle">{age(item.submittedAt)}</p>
                    <Link
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg"
                      href={`/vendors/payment-access/${item.branchId}`}
                    >
                      <Eye aria-hidden className="size-4" />
                      Review
                      <span className="sr-only"> request for {item.companyName}, {item.branchName}</span>
                    </Link>
                  </div>
                </div>
              </div>
            ))}
            {shown.length === 0 ? (
              <p className="px-5 py-6 text-sm text-fg-subtle">No matching payment access requests.</p>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
