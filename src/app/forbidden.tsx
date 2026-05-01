import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f8fa] px-6 text-zinc-950">
      <section className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          403
        </p>
        <h1 className="mt-2 text-2xl font-semibold">Access denied</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          Your account does not have permission to view this admin page.
        </p>
        <Link
          className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800"
          href="/"
        >
          Return to dashboard
        </Link>
      </section>
    </main>
  );
}
