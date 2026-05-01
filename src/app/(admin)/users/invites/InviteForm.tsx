"use client";

import { useActionState } from "react";

import { INVITABLE_ADMIN_ROLES, ROLE_LABELS } from "@/lib/auth/roles";
import { createInviteAction, type CreateInviteState } from "../actions";

const initialState: CreateInviteState = {
  status: "idle",
};

export function InviteForm() {
  const [state, formAction, isPending] = useActionState(
    createInviteAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-zinc-700" htmlFor="name">
            Name
          </label>
          <input
            className="mt-2 h-11 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-950"
            id="name"
            name="name"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700" htmlFor="email">
            Email
          </label>
          <input
            autoComplete="email"
            className="mt-2 h-11 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-950"
            id="email"
            name="email"
            required
            type="email"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700" htmlFor="role">
          Role
        </label>
        <select
          className="mt-2 h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-zinc-950"
          id="role"
          name="role"
          required
        >
          {INVITABLE_ADMIN_ROLES.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </select>
      </div>

      {state.message ? (
        <p
          className={
            state.status === "error"
              ? "rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              : "rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
          }
        >
          {state.message}
        </p>
      ) : null}

      <button
        className="h-11 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Creating invite..." : "Create invite"}
      </button>
    </form>
  );
}
