/**
 * @fileoverview Shared payout-history filter bar for vendor and admin pages.
 * @module features/vendors/PayoutHistoryFilterBar
 */

"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import type { VendorPayoutHistoryFilters } from "@/lib/vendors/payoutHistory";

const inputClassName =
  "h-10 rounded-md border border-border bg-surface px-3 text-sm font-normal text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-60";
const labelClassName = "grid gap-1 text-xs font-medium text-fg-muted";

export function PayoutHistoryFilterBar({
  basePath,
  filters,
}: {
  basePath: string;
  filters: VendorPayoutHistoryFilters;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<"apply" | "reset" | null>(null);

  function navigate(params: URLSearchParams) {
    const query = params.toString();
    startTransition(() => {
      router.push(query ? `${basePath}?${query}` : basePath);
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    for (const [key, value] of formData.entries()) {
      if (typeof value === "string" && value.trim()) params.set(key, value);
    }
    setPendingAction("apply");
    navigate(params);
  }

  function handleReset() {
    setPendingAction("reset");
    navigate(new URLSearchParams());
  }

  const filterKey = [filters.status, filters.initiationSource, filters.dateFrom, filters.dateTo]
    .map((value) => value ?? "")
    .join("|");

  return (
    <section className="rounded-xl border border-border bg-surface p-4 shadow-md">
      <form className="grid gap-3 lg:grid-cols-[repeat(4,minmax(10rem,1fr))_auto]" key={filterKey} onSubmit={handleSubmit}>
        <label className={labelClassName}>
          Status
          <select className={inputClassName} defaultValue={filters.status ?? ""} disabled={isPending} name="status">
            <option value="">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="PROCESSING">Processing</option>
            <option value="COMPLETED">Completed</option>
            <option value="FAILED">Failed</option>
            <option value="REQUIRES_RECONCILIATION">Needs reconciliation</option>
          </select>
        </label>
        <label className={labelClassName}>
          Source
          <select className={inputClassName} defaultValue={filters.initiationSource ?? ""} disabled={isPending} name="source">
            <option value="">All sources</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="MANUAL">Manual</option>
          </select>
        </label>
        <label className={labelClassName}>
          From
          <input className={inputClassName} defaultValue={filters.dateFrom ?? ""} disabled={isPending} name="dateFrom" type="date" />
        </label>
        <label className={labelClassName}>
          To
          <input className={inputClassName} defaultValue={filters.dateTo ?? ""} disabled={isPending} name="dateTo" type="date" />
        </label>
        <div className="flex items-end gap-2">
          <button
            className="flex h-10 items-center justify-center gap-1.5 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
            type="submit"
          >
            {isPending && pendingAction === "apply" ? <Loader2 aria-hidden="true" className="animate-spin" size={15} /> : null}
            Apply
          </button>
          <button
            className="inline-flex h-10 items-center gap-1.5 rounded-md bg-surface-muted px-3 text-sm font-medium text-fg-muted transition hover:bg-brand-50 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
            onClick={handleReset}
            type="button"
          >
            {isPending && pendingAction === "reset" ? <Loader2 aria-hidden="true" className="animate-spin" size={15} /> : null}
            Reset
          </button>
        </div>
      </form>
    </section>
  );
}
