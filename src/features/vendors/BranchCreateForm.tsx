"use client";

import { useActionState } from "react";

import { createBranchAction, type BranchActionState } from "@/app/vendor/(portal)/branches/actions";

const initialState: BranchActionState = {};

export function BranchCreateForm() {
  const [state, action, pending] = useActionState(createBranchAction, initialState);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <label className="grid gap-1 text-sm font-medium text-zinc-800">
        Branch name
        <input className="h-10 rounded-md border border-zinc-300 px-3 font-normal" maxLength={100} name="name" required />
      </label>
      <label className="grid gap-1 text-sm font-medium text-zinc-800">
        Address <span className="font-normal text-zinc-400">Optional</span>
        <input className="h-10 rounded-md border border-zinc-300 px-3 font-normal" maxLength={240} name="address" />
      </label>
      {state.error && <p className="text-sm text-red-600 sm:col-span-2">{state.error}</p>}
      <div className="sm:col-span-2">
        <button className="h-10 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-50" disabled={pending} type="submit">
          {pending ? "Creating branch..." : "Create branch"}
        </button>
      </div>
    </form>
  );
}
