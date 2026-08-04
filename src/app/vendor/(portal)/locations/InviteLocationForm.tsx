"use client";

import { useActionState } from "react";

import {
  createVendorInviteAction,
  type CreateVendorInviteState,
} from "./actions";

const initialState: CreateVendorInviteState = {
  status: "idle",
};

export function InviteLocationForm() {
  const [state, formAction, isPending] = useActionState(
    createVendorInviteAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5">
      <div>
        <h2 className="text-base font-semibold text-zinc-950">Invite location</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Create a login for a physical service location under your approved vendor account.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-zinc-700" htmlFor="locationName">
            Location name
          </label>
          <input
            className="mt-2 h-11 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-950"
            id="locationName"
            name="locationName"
            required
            type="text"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700" htmlFor="name">
            Contact name
          </label>
          <input
            className="mt-2 h-11 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-950"
            id="name"
            name="name"
            required
            type="text"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700" htmlFor="email">
            Work email
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
        <div>
          <label className="block text-sm font-medium text-zinc-700" htmlFor="locationAddress">
            Location address
          </label>
          <input
            className="mt-2 h-11 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-950"
            id="locationAddress"
            name="locationAddress"
            type="text"
          />
        </div>
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
