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

export function ForgotPasswordForm({ isVendor = false }: { isVendor?: boolean }) {
  const [state, formAction, isPending] = useActionState(
    requestPasswordResetAction,
    initialState,
  );
  const backHref = isVendor ? "/vendor/sign-in" : "/sign-in";

  return (
    <main
      className="grid min-h-screen place-items-center bg-canvas px-6"
      data-portal={isVendor ? "vendor" : undefined}
    >
      <section className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-md">
        <div className="mb-8 flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[linear-gradient(180deg,var(--sidebar-from),var(--sidebar-to))] text-white">
            <KeyRound size={20} aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-medium text-fg-subtle">UNIFY</p>
            <h1 className="text-page-title text-fg">Reset password</h1>
          </div>
        </div>

        <p className="mb-6 text-sm text-fg-muted">
          Enter your {isVendor ? "vendor" : "admin"} email and we will send password reset instructions if the account is active.
        </p>

        <form action={formAction} className="space-y-4">
          <input name="portal" type="hidden" value={isVendor ? "vendor" : "admin"} />
          <div>
            <label className="block text-sm font-medium text-fg" htmlFor="email">
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
            className="flex h-11 w-full items-center justify-center rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
            type="submit"
          >
            {isPending ? "Sending..." : "Send reset instructions"}
          </button>
        </form>

        <Link className="mt-6 block text-center text-sm font-medium text-fg-muted hover:text-fg" href={backHref}>
          Back to sign in
        </Link>
      </section>
    </main>
  );
}
