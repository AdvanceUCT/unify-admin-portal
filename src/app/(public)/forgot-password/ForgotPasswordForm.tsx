"use client";

import Link from "next/link";
import { useActionState } from "react";
import { KeyRound } from "lucide-react";

import {
  requestPasswordResetAction,
  type ForgotPasswordState,
} from "./actions";

const initialState: ForgotPasswordState = {
  status: "idle",
};

export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(
    requestPasswordResetAction,
    initialState,
  );

  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f8fa] px-6">
      <section className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="mb-8 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-md bg-zinc-950 text-white">
            <KeyRound size={20} aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-medium text-zinc-500">UNIFY</p>
            <h1 className="text-xl font-semibold text-zinc-950">Reset password</h1>
          </div>
        </div>

        <p className="mb-6 text-sm text-zinc-600">
          Enter your admin email and we will send password reset instructions if the account is active.
        </p>

        <form action={formAction} className="space-y-4">
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
            className="flex h-11 w-full items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
            type="submit"
          >
            {isPending ? "Sending..." : "Send reset instructions"}
          </button>
        </form>

        <Link className="mt-6 block text-center text-sm font-medium text-zinc-600 hover:text-zinc-950" href="/sign-in">
          Back to sign in
        </Link>
      </section>
    </main>
  );
}
