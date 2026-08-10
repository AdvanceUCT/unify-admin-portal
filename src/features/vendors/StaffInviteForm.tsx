"use client";

import { useActionState } from "react";

import { createStaffInviteAction, type StaffInviteState } from "@/app/vendor/(portal)/staff/actions";

const inputClassName =
  "h-10 rounded-md border border-border bg-surface px-3 text-sm font-normal text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";
const labelClassName = "grid gap-1 text-sm font-medium text-fg-muted";

export function StaffInviteForm({ branches }: { branches: Array<{ id: string; name: string }> }) {
  const [state, action, pending] = useActionState<StaffInviteState, FormData>(createStaffInviteAction, {});
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClassName}>Name<input className={inputClassName} maxLength={100} name="name" required /></label>
        <label className={labelClassName}>Email<input className={inputClassName} name="email" required type="email" /></label>
      </div>
      <fieldset>
        <legend className="text-sm font-medium text-fg-muted">Assigned branches</legend>
        <div className="mt-2 flex flex-wrap gap-3">
          {branches.map((branch) => <label className="flex items-center gap-2 text-sm text-fg-muted" key={branch.id}><input name="branchId" type="checkbox" value={branch.id} />{branch.name}</label>)}
        </div>
      </fieldset>
      {state.error && <p className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-fg">{state.error}</p>}
      {state.success && <p className="rounded-md border border-success-border bg-success-bg px-3 py-2 text-sm text-success-fg">{state.success}</p>}
      <button className="h-10 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-fg-subtle" disabled={pending || branches.length === 0} type="submit">{pending ? "Sending invite..." : "Invite staff member"}</button>
    </form>
  );
}
