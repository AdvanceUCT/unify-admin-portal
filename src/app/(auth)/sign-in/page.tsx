import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export default function SignInPage() {
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

        <div className="space-y-4">
          <label className="block text-sm font-medium text-zinc-700" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            className="h-11 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-950"
            defaultValue="operator@unify.test"
            readOnly
          />
          <label className="block text-sm font-medium text-zinc-700" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            className="h-11 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-950"
            defaultValue="mock-session"
            readOnly
            type="password"
          />
        </div>

        <Link
          className="mt-6 flex h-11 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800"
          href="/"
        >
          Continue
        </Link>
      </section>
    </main>
  );
}
