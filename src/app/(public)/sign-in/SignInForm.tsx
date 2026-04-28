"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
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
    return "This account has been deactivated. Contact your administrator.";
  }

  return "Invalid email or password";
}

export function SignInForm({
  callbackURL,
  notice,
}: {
  callbackURL: string;
  notice?: string;
}) {
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
    const safeCallbackURL = sanitizeCallbackUrl(callbackURL);

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
    <main className="grid min-h-screen place-items-center bg-[#f7f8fa] px-6">
      <section className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="mb-8 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-md bg-zinc-950 text-white">
            <ShieldCheck size={20} aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-medium text-zinc-500">UNIFY</p>
            <h1 className="text-xl font-semibold text-zinc-950">Admin portal</h1>
          </div>
        </div>

        {notice ? (
          <p className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {notice}
          </p>
        ) : null}

        <form className="space-y-4" onSubmit={handleSubmit}>
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

          <div>
            <label className="block text-sm font-medium text-zinc-700" htmlFor="password">
              Password
            </label>
            <div className="relative mt-2">
              <input
                autoComplete="current-password"
                className="h-11 w-full rounded-md border border-zinc-300 px-3 pr-11 text-sm outline-none transition focus:border-zinc-950"
                id="password"
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

          {errorMessage ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {errorMessage}
            </p>
          ) : null}

          <button
            className="flex h-11 w-full items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
            type="submit"
          >
            {isPending ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <Link
          className="mt-6 block text-center text-sm font-medium text-zinc-600 hover:text-zinc-950"
          href="/forgot-password"
        >
          Forgot password?
        </Link>
      </section>
    </main>
  );
}
