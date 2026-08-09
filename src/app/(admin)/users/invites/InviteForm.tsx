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
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-fg-muted" htmlFor="name">
            Name
          </label>
          <input
            className="mt-2 h-11 w-full rounded-md border border-border px-3 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            id="name"
            name="name"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-fg-muted" htmlFor="email">
            Email
          </label>
          <input
            autoComplete="email"
            className="mt-2 h-11 w-full rounded-md border border-border px-3 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            id="email"
            name="email"
            required
            type="email"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-fg-muted" htmlFor="role">
          Role
        </label>
        <select
          className="mt-2 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
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
              ? "rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-fg"
              : "rounded-md border border-success-border bg-success-bg px-3 py-2 text-sm text-success-fg"
          }
        >
          {state.message}
        </p>
      ) : null}

      <button
        className="h-11 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Creating invite..." : "Create invite"}
      </button>
    </form>
  );
}
