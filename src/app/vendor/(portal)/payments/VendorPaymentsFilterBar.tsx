/**
 * @fileoverview Renders the filter bar used by `/vendor/payments`.
 * @module app/vendor/(portal)/payments/VendorPaymentsFilterBar
 */

"use client";

import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";

import type { VendorPaymentEventFilters } from "@/lib/vendors/livePayments";

const inputClassName =
  "h-10 rounded-md border border-border bg-surface px-3 text-sm font-normal text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-60";
const labelClassName = "grid gap-1 text-xs font-medium text-fg-muted";

export function VendorPaymentsFilterBar({
  branches,
  filters,
  showBranchFilter,
}: {
  branches: { id: string; name: string }[];
  filters: VendorPaymentEventFilters;
  showBranchFilter: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<"apply" | "reset" | null>(null);

  function navigate(params: URLSearchParams) {
    const query = params.toString();
    startTransition(() => {
      router.push(query ? `/vendor/payments?${query}` : "/vendor/payments");
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

  const filterKey = [filters.query, filters.refundStatus, filters.dateFrom, filters.dateTo, filters.branchId]
    .map((value) => value ?? "")
    .join("|");

  return (
    <section className="rounded-xl border border-border bg-surface p-4 shadow-md">
      <form className="grid gap-3 lg:grid-cols-[minmax(14rem,1fr)_repeat(3,minmax(10rem,12rem))_auto]" key={filterKey} onSubmit={handleSubmit}>
        <label className={labelClassName}>
          Search
          <input className={inputClassName} defaultValue={filters.query ?? ""} disabled={isPending} name="q" placeholder="Name, number, reference" />
        </label>
        <label className={labelClassName}>
          Refund status
          <select className={inputClassName} defaultValue={filters.refundStatus ?? ""} disabled={isPending} name="refundStatus">
            <option value="">All payments</option>
            <option value="REFUNDABLE">Refundable</option>
            <option value="EXPIRED">Window closed</option>
            <option value="FULLY_REFUNDED">Fully refunded</option>
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
        {showBranchFilter && (
          <label className={`${labelClassName} lg:col-span-2`}>
            Branch
            <select className={inputClassName} defaultValue={filters.branchId ?? ""} disabled={isPending} name="branchId">
              <option value="">All branches</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </label>
        )}
        <div className="flex items-end gap-2">
          <button
            className="flex h-10 items-center justify-center gap-1.5 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
            type="submit"
          >
            {isPending && pendingAction === "apply" && <Loader2 aria-hidden="true" className="animate-spin" size={15} />}
            Apply
          </button>
          <button
            className="inline-flex h-10 items-center gap-1.5 rounded-md bg-surface-muted px-3 text-sm font-medium text-fg-muted transition hover:bg-brand-50 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
            onClick={handleReset}
            type="button"
          >
            {isPending && pendingAction === "reset" && <Loader2 aria-hidden="true" className="animate-spin" size={15} />}
            Reset
          </button>
        </div>
      </form>
    </section>
  );
}
