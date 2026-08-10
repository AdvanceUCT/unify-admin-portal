/**
 * @fileoverview Renders the public portal page at `/verify`.
 * @module app/(public)/verify/page
 */

export default function MissingVerificationServicePointPage() {
  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-12 text-zinc-950">
      <section className="mx-auto max-w-xl rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">UNIFY student verification</p>
        <h1 className="mt-3 text-2xl font-semibold">This verification link is incomplete</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          Scan the complete service-point QR code again. It must include the public service-point identifier.
        </p>
      </section>
    </main>
  );
}
