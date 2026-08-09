"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Eye, EyeOff, Landmark } from "lucide-react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth/auth-client";
import { createVendorProfileAction } from "@/app/vendor/(auth)/sign-up/actions";
import { SERVICE_CATEGORIES } from "@/lib/vendors/constants";

export function VendorSignUpForm() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsPending(true);

    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "");
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const companyName = String(formData.get("companyName") ?? "");
    const serviceCategory = String(formData.get("serviceCategory") ?? "");

    const result = await authClient.signUp.email({ name, email, password });

    if (result.error) {
      setIsPending(false);
      setErrorMessage(result.error.message ?? "Unable to create your account.");
      return;
    }

    const profileResult = await createVendorProfileAction({ companyName, serviceCategory });

    setIsPending(false);

    if (profileResult.status === "error") {
      setErrorMessage(
        `Your account was created, but we couldn't save your organisation details: ${profileResult.message}. You can update your profile after signing in.`,
      );
    }

    router.push("/vendor");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-6 py-10" data-portal="vendor">
      <section className="w-full max-w-2xl rounded-xl border border-border bg-surface p-6 shadow-md sm:p-8">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[linear-gradient(180deg,var(--sidebar-from),var(--sidebar-to))] text-white">
            <Landmark size={20} aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-medium text-fg-subtle">UNIFY</p>
            <h1 className="text-page-title text-fg">Vendor sign up</h1>
          </div>
        </div>
        <p className="mb-6 text-sm text-fg-muted">
          Tell us who the primary contact is and which organisation they represent. We&apos;ll
          use this email to communicate with you about your application.
        </p>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="grid gap-6 sm:grid-cols-2">
            <fieldset className="space-y-3">
              <legend className="text-caption font-medium uppercase tracking-wide text-fg-subtle">
                Primary contact
              </legend>

              <div>
                <label className="block text-sm font-medium text-fg" htmlFor="name">
                  Full name
                </label>
                <input
                  autoComplete="name"
                  className="mt-2 h-11 w-full rounded-md border border-border px-3 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  id="name"
                  name="name"
                  required
                  type="text"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-fg" htmlFor="email">
                  Work email address
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
            </fieldset>

            <fieldset className="space-y-3 sm:border-l sm:border-border sm:pl-6">
              <legend className="text-caption font-medium uppercase tracking-wide text-fg-subtle">
                Organisation
              </legend>

              <div>
                <label className="block text-sm font-medium text-fg" htmlFor="companyName">
                  Organisation name
                </label>
                <input
                  className="mt-2 h-11 w-full rounded-md border border-border px-3 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  id="companyName"
                  name="companyName"
                  required
                  type="text"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-fg" htmlFor="serviceCategory">
                  Service category
                </label>
                <select
                  className="mt-2 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  id="serviceCategory"
                  name="serviceCategory"
                  required
                >
                  <option value="">Select a category</option>
                  {SERVICE_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>
            </fieldset>
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
            {isPending ? "Creating account..." : "Create vendor account"}
          </button>
        </form>

        <Link
          className="mt-4 block text-center text-sm font-medium text-fg-muted hover:text-fg"
          href="/forgot-password?portal=vendor"
        >
          Forgot password?
        </Link>
        <p className="mt-2 text-center text-sm font-medium text-fg-muted">
          Already have an account?{" "}
          <Link className="text-blue-600 underline hover:text-blue-700" href="/vendor/sign-in">
            Sign in
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
