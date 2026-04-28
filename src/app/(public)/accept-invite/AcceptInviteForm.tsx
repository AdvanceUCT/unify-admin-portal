"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { ROLE_LABELS, type AdminRole } from "@/lib/auth/roles";
import { acceptInviteAction, type AcceptInviteState } from "./actions";

const initialState: AcceptInviteState = {
  status: "idle",
};

export function AcceptInviteForm({
  email,
  expiresAtLabel,
  name,
  role,
  token,
}: {
  email: string;
  expiresAtLabel: string;
  name: string;
  role: string;
  token: string;
}) {
  const [state, formAction, isPending] = useActionState(
    acceptInviteAction,
    initialState,
  );
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <input name="token" type="hidden" value={token} />

      <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-700">
        <p>
          <span className="font-medium text-zinc-950">{name}</span> ({email})
        </p>
        <p className="mt-1">
          Role: {ROLE_LABELS[role as AdminRole] ?? role} · Expires: {expiresAtLabel}
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700" htmlFor="password">
          Password
        </label>
        <div className="relative mt-2">
          <input
            autoComplete="new-password"
            className="h-11 w-full rounded-md border border-zinc-300 px-3 pr-11 text-sm outline-none transition focus:border-zinc-950"
            id="password"
            minLength={12}
            name="password"
            required
            type={showPassword ? "text" : "password"}
          />
          <button
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 grid w-11 place-items-center text-zinc-500 transition hover:text-zinc-950"
            onClick={() => setShowPassword((value) => !value)}
            type="button"
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700" htmlFor="confirmPassword">
          Confirm password
        </label>
        <input
          autoComplete="new-password"
          className="mt-2 h-11 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-950"
          id="confirmPassword"
          minLength={12}
          name="confirmPassword"
          required
          type={showPassword ? "text" : "password"}
        />
      </div>

      {state.message ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.message}
        </p>
      ) : null}

      <button
        className="flex h-11 w-full items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Creating account..." : "Create account"}
      </button>
    </form>
  );
}
