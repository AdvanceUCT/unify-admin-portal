"use client";

import { useActionState } from "react";

import { createStaffInviteAction, type StaffInviteState } from "@/app/vendor/(portal)/staff/actions";

export function StaffInviteForm({ branches }: { branches: Array<{ id: string; name: string }> }) {
  const [state, action, pending] = useActionState<StaffInviteState, FormData>(createStaffInviteAction, {});
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium">Name<input className="h-10 rounded-md border border-zinc-300 px-3 font-normal" maxLength={100} name="name" required /></label>
        <label className="grid gap-1 text-sm font-medium">Email<input className="h-10 rounded-md border border-zinc-300 px-3 font-normal" name="email" required type="email" /></label>
      </div>
      <fieldset>
        <legend className="text-sm font-medium text-zinc-800">Assigned branches</legend>
        <div className="mt-2 flex flex-wrap gap-3">
          {branches.map((branch) => <label className="flex items-center gap-2 text-sm text-zinc-700" key={branch.id}><input name="branchId" type="checkbox" value={branch.id} />{branch.name}</label>)}
        </div>
      </fieldset>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.success && <p className="text-sm text-emerald-700">{state.success}</p>}
      <button className="h-10 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-50" disabled={pending || branches.length === 0} type="submit">{pending ? "Sending invite..." : "Invite staff member"}</button>
    </form>
  );
}
