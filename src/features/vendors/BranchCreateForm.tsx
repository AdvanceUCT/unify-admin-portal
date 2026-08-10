"use client";

import { useActionState } from "react";

import { createBranchAction, type BranchActionState } from "@/app/vendor/(portal)/branches/actions";

const initialState: BranchActionState = {};
const inputClassName =
  "h-10 rounded-md border border-border bg-surface px-3 text-sm font-normal text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";
const labelClassName = "grid gap-1 text-sm font-medium text-fg-muted";

export function BranchCreateForm() {
  const [state, action, pending] = useActionState(createBranchAction, initialState);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <label className={labelClassName}>
        Branch name
        <input className={inputClassName} maxLength={100} name="name" required />
      </label>
      <label className={labelClassName}>
        <span>Address <span className="font-normal text-fg-subtle">Optional</span></span>
        <input className={inputClassName} maxLength={240} name="address" />
      </label>
      {state.error && <p className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-fg sm:col-span-2">{state.error}</p>}
      <div className="sm:col-span-2">
        <button className="h-10 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-fg-subtle" disabled={pending} type="submit">
          {pending ? "Creating branch..." : "Create branch"}
        </button>
      </div>
    </form>
  );
}
