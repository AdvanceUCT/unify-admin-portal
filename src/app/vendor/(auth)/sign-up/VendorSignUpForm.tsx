"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Landmark } from "lucide-react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth/auth-client";
import { createVendorProfileAction } from "@/app/vendor/(auth)/sign-up/actions";
import { SERVICE_CATEGORIES } from "@/lib/vendors/constants";

export function VendorSignUpForm() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

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
    <main className="grid min-h-screen place-items-center bg-[#f7f8fa] px-6">
      <section className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-md bg-zinc-950 text-white">
            <Landmark size={20} aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-medium text-zinc-500">UNIFY</p>
            <h1 className="text-xl font-semibold text-zinc-950">Vendor sign up</h1>
          </div>
        </div>
        <p className="mb-5 text-xs text-zinc-500">
          Tell us who the primary contact is and which organisation they represent. We&apos;ll
          use this email to communicate with you about your application.
        </p>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Primary contact
            </legend>

            <div>
              <label className="block text-sm font-medium text-zinc-700" htmlFor="name">
                Full name
              </label>
              <input
                autoComplete="name"
                className="mt-1 h-11 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-950"
                id="name"
                name="name"
                required
                type="text"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700" htmlFor="email">
                Work email address
              </label>
              <input
                autoComplete="email"
                className="mt-1 h-11 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-950"
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
              <input
                autoComplete="new-password"
                className="mt-1 h-11 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-950"
                id="password"
                minLength={12}
                name="password"
                required
                type="password"
              />
            </div>
          </fieldset>

          <fieldset className="space-y-3 border-t border-zinc-200 pt-4">
            <legend className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Organisation
            </legend>

            <div>
              <label className="block text-sm font-medium text-zinc-700" htmlFor="companyName">
                Organisation name
              </label>
              <input
                className="mt-1 h-11 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-950"
                id="companyName"
                name="companyName"
                required
                type="text"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700" htmlFor="serviceCategory">
                Service category
              </label>
              <select
                className="mt-1 h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-zinc-950"
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
            {isPending ? "Creating account..." : "Create vendor account"}
          </button>
        </form>

        <Link
          className="mt-4 block text-center text-sm font-medium text-zinc-600 hover:text-zinc-950"
          href="/forgot-password?portal=vendor"
        >
          Forgot password?
        </Link>
        <p className="mt-2 text-center text-sm font-medium text-zinc-600">
          Already have an account?{" "}
          <Link className="text-blue-600 underline hover:text-blue-700" href="/vendor/sign-in">
            Sign in
          </Link>
        </p>
        <p className="mt-2 text-center text-sm font-medium text-zinc-600">
          Staff member?{" "}
          <Link className="text-blue-600 underline hover:text-blue-700" href="/sign-in">
            Go to the admin portal
          </Link>
        </p>
      </section>
    </main>
  );
}
