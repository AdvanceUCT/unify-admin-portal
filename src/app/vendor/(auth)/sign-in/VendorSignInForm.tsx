"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Eye, EyeOff, Landmark } from "lucide-react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth/auth-client";
import { sanitizeCallbackUrl } from "@/lib/auth/redirects";

function getSignInErrorMessage(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    String(error.code).includes("BANNED")
  ) {
    return "This account has been deactivated. Contact the issuing university.";
  }

  return "Invalid email or password";
}

export function VendorSignInForm({ callbackURL }: { callbackURL: string }) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsPending(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const safeCallbackURL = sanitizeCallbackUrl(callbackURL, "/vendor");

    const result = await authClient.signIn.email({
      email,
      password,
      callbackURL: safeCallbackURL,
    });

    setIsPending(false);

    if (result.error) {
      setErrorMessage(getSignInErrorMessage(result.error));
      return;
    }

    router.push(safeCallbackURL);
    router.refresh();
  }

  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-6" data-portal="vendor">
      <section className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-md">
        <div className="mb-8 flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[linear-gradient(180deg,var(--sidebar-from),var(--sidebar-to))] text-white">
            <Landmark size={20} aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-medium text-fg-subtle">UNIFY</p>
            <h1 className="text-page-title text-fg">Vendor portal</h1>
          </div>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
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

          <div>
            <label className="block text-sm font-medium text-fg" htmlFor="password">
              Password
            </label>
            <div className="relative mt-2">
              <input
                autoComplete="current-password"
                className="h-11 w-full rounded-md border border-border px-3 pr-11 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                id="password"
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

          {errorMessage ? (
            <p className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-fg">
              {errorMessage}
            </p>
          ) : null}

          <button
            className="flex h-11 w-full items-center justify-center rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
            type="submit"
          >
            {isPending ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <Link
          className="mt-6 block text-center text-sm font-medium text-fg-muted hover:text-fg"
          href="/forgot-password?portal=vendor"
        >
          Forgot password?
        </Link>
        <p className="mt-2 text-center text-sm font-medium text-fg-muted">
          Need a vendor account?{" "}
          <Link className="text-blue-600 underline hover:text-blue-700" href="/vendor/sign-up">
            Sign up
          </Link>
        </p>
        <p className="mt-2 text-center text-sm font-medium text-fg-muted">
          Staff member?{" "}
          <Link className="text-blue-600 underline hover:text-blue-700" href="/sign-in">
            Go to the admin portal
          </Link>
        </p>
      </section>
    </main>
  );
}
