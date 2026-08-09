"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Eye, EyeOff, KeyRound } from "lucide-react";

import { resetPasswordAction, type ResetPasswordState } from "./actions";

const initialState: ResetPasswordState = {
  status: "idle",
};

export function ResetPasswordForm({
  isVendor = false,
  token,
}: {
  isVendor?: boolean;
  token?: string;
}) {
  const [state, formAction, isPending] = useActionState(
    resetPasswordAction,
    initialState,
  );
  const [showPassword, setShowPassword] = useState(false);
  const forgotPasswordHref = isVendor ? "/forgot-password?portal=vendor" : "/forgot-password";

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
            <h1 className="text-page-title text-fg">Set new password</h1>
          </div>
        </div>

        {!token ? (
          <div className="space-y-4">
            <p className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-fg">
              This reset link is invalid or expired.
            </p>
            <Link
              className="block text-center text-sm font-medium text-fg-muted hover:text-fg"
              href={forgotPasswordHref}
            >
              Request a new reset link
            </Link>
          </div>
        ) : (
          <form action={formAction} className="space-y-4">
            <input name="token" type="hidden" value={token} />
            <input name="portal" type="hidden" value={isVendor ? "vendor" : "admin"} />

            <div>
              <label className="block text-sm font-medium text-fg" htmlFor="password">
                New password
              </label>
              <div className="relative mt-2">
                <input
                  autoComplete="new-password"
                  className="h-11 w-full rounded-md border border-border px-3 pr-11 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  id="password"
                  minLength={12}
                  name="password"
                  required
                  type={showPassword ? "text" : "password"}
                />
                <button
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-0 grid w-11 place-items-center text-fg-subtle transition hover:text-fg"
                  onClick={() => setShowPassword((value) => !value)}
                  type="button"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-fg" htmlFor="confirmPassword">
                Confirm new password
              </label>
              <input
                autoComplete="new-password"
                className="mt-2 h-11 w-full rounded-md border border-border px-3 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                id="confirmPassword"
                minLength={12}
                name="confirmPassword"
                required
                type={showPassword ? "text" : "password"}
              />
            </div>

            {state.message ? (
              <p className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-fg">
                {state.message}
              </p>
            ) : null}

            <button
              className="flex h-11 w-full items-center justify-center rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
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
