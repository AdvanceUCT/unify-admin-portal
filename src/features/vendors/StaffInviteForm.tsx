"use client";

import { useActionState } from "react";

import { createStaffInviteAction, type StaffInviteState } from "@/app/vendor/(portal)/staff/actions";
import { BranchMultiSelect } from "@/features/vendors/BranchMultiSelect";

const inputClassName =
  "h-10 rounded-md border border-border bg-surface px-3 text-sm font-normal text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";
const labelClassName = "grid gap-1 text-sm font-medium text-fg-muted";

export function StaffInviteForm({ branches }: { branches: Array<{ id: string; name: string }> }) {
  const [state, action, pending] = useActionState<StaffInviteState, FormData>(createStaffInviteAction, {});
  const resetKey = state.resetKey ?? "initial";

  return (
    <form action={action} className="space-y-4" key={resetKey}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClassName}>Name<input className={inputClassName} defaultValue={state.values?.name ?? ""} maxLength={100} name="name" required /></label>
        <label className={labelClassName}>Email<input className={inputClassName} defaultValue={state.values?.email ?? ""} name="email" required type="email" /></label>
      </div>
      <fieldset>
        <legend className="text-sm font-medium text-fg-muted">Assigned branches</legend>
        <div className="mt-2">
          {branches.length > 0 ? (
            <BranchMultiSelect
              branches={branches}
              defaultSelectedIds={state.values?.branchIds ?? []}
              emptyLabel="No branches selected"
              name="branchId"
              triggerLabel="Select branches"
            />
          ) : (
            <p className="text-sm text-fg-subtle">No branches available yet.</p>
          )}
        </div>
      </fieldset>
      {state.error && <p className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-fg">{state.error}</p>}
      {state.success && <p className="rounded-md border border-success-border bg-success-bg px-3 py-2 text-sm text-success-fg">{state.success}</p>}
      <button className="h-10 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-fg-subtle" disabled={pending || branches.length === 0} type="submit">{pending ? "Sending invite..." : "Invite staff member"}</button>
    </form>
  );
}
