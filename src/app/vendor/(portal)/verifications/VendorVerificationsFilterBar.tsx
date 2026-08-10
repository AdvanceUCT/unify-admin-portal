"use client";

import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";

import type { VendorVerificationEventFilters } from "@/lib/vendors/verifications";

const inputClassName =
  "h-10 rounded-md border border-border bg-surface px-3 text-sm font-normal text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-60";
const labelClassName = "grid gap-1 text-xs font-medium text-fg-muted";

/**
 * `isPending` alone can't tell Apply and Reset apart since both share one
 * `useTransition` — `pendingAction` records which button triggered the
 * in-flight navigation so only that one shows a spinner. It's fine to leave
 * stale after the transition settles: both spinners are gated on
 * `isPending`, so a stale value only matters while a transition is actually
 * pending.
 */
export function VendorVerificationsFilterBar({
  branches,
  filters,
  showBranchFilter,
  universities,
}: {
  branches: { id: string; name: string }[];
  filters: VendorVerificationEventFilters;
  showBranchFilter: boolean;
  universities: string[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<"apply" | "reset" | null>(null);

  function navigate(params: URLSearchParams) {
    const query = params.toString();
    startTransition(() => {
      router.push(query ? `/vendor/verifications?${query}` : "/vendor/verifications");
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

  // Inputs below are uncontrolled (defaultValue) — React only applies
  // defaultValue on mount, so once the form has rendered once, navigating
  // (e.g. Reset clearing the query string) changes the `filters` prop but
  // not what's showing in the fields. Keying the form on the filter values
  // forces a remount whenever they actually change, so the fields stay in
  // sync with the URL for both Apply and Reset.
  const filterKey = [filters.query, filters.university, filters.dateFrom, filters.dateTo, filters.branchId]
    .map((value) => value ?? "")
    .join("|");

  return (
    <section className="rounded-xl border border-border bg-surface p-4 shadow-md">
      <form className="grid gap-3 lg:grid-cols-[minmax(14rem,1fr)_repeat(3,minmax(10rem,12rem))_auto]" key={filterKey} onSubmit={handleSubmit}>
        <label className={labelClassName}>
          Search
          <input className={inputClassName} defaultValue={filters.query ?? ""} disabled={isPending} name="q" placeholder="Name or student number" />
        </label>
        <label className={labelClassName}>
          University
          <select className={inputClassName} defaultValue={filters.university ?? ""} disabled={isPending} name="university">
            <option value="">All universities</option>
            {universities.map((university) => <option key={university} value={university}>{university}</option>)}
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
