"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Eye, EyeOff, KeyRound } from "lucide-react";

import { resetPasswordAction, type ResetPasswordState } from "./actions";

const initialState: ResetPasswordState = {
  status: "idle",
};

export function ResetPasswordForm({ token }: { token?: string }) {
  const [state, formAction, isPending] = useActionState(
    resetPasswordAction,
    initialState,
  );
  const [showPassword, setShowPassword] = useState(false);

  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f8fa] px-6">
      <section className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="mb-8 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-md bg-zinc-950 text-white">
            <KeyRound size={20} aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-medium text-zinc-500">UNIFY</p>
            <h1 className="text-xl font-semibold text-zinc-950">Set new password</h1>
          </div>
        </div>

        {!token ? (
          <div className="space-y-4">
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              This reset link is invalid or expired.
            </p>
            <Link
              className="block text-center text-sm font-medium text-zinc-600 hover:text-zinc-950"
              href="/forgot-password"
            >
              Request a new reset link
            </Link>
          </div>
        ) : (
          <form action={formAction} className="space-y-4">
            <input name="token" type="hidden" value={token} />

            <div>
              <label className="block text-sm font-medium text-zinc-700" htmlFor="password">
                New password
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
                Confirm new password
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
              {isPending ? "Updating..." : "Update password"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
