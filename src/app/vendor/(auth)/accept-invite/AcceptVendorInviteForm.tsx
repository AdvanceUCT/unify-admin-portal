"use client";

import { Eye, EyeOff } from "lucide-react";
import { useActionState, useState } from "react";

import { acceptVendorInviteAction, type AcceptVendorInviteState } from "./actions";

export function AcceptVendorInviteForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<AcceptVendorInviteState, FormData>(acceptVendorInviteAction, {});
  const [visible, setVisible] = useState(false);

  return (
    <form action={action} className="mt-6 space-y-4">
      <input name="token" type="hidden" value={token} />

      <div>
        <label className="block text-sm font-medium text-fg" htmlFor="password">
          Password
        </label>
        <div className="relative mt-2">
          <input
            autoComplete="new-password"
            className="h-11 w-full rounded-md border border-border px-3 pr-11 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            id="password"
            minLength={12}
            name="password"
            required
            type={visible ? "text" : "password"}
          />
          <button
            aria-label={visible ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 grid w-11 place-items-center text-fg-subtle transition hover:text-fg"
            onClick={() => setVisible((value) => !value)}
            type="button"
          >
            {visible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-fg" htmlFor="confirmPassword">
          Confirm password
        </label>
        <input
          autoComplete="new-password"
          className="mt-2 h-11 w-full rounded-md border border-border px-3 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          id="confirmPassword"
          minLength={12}
          name="confirmPassword"
          required
          type={visible ? "text" : "password"}
        />
      </div>

      {state.error ? (
        <p className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-fg">
          {state.error}
        </p>
      ) : null}

      <button
        className="flex h-11 w-full items-center justify-center rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Creating account..." : "Create staff account"}
      </button>
    </form>
  );
}
