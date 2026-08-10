/**
 * @fileoverview Renders the public portal page at `/accept-invite`.
 * @module app/(public)/accept-invite/page
 */

import Link from "next/link";
import { ShieldCheck, ShieldX } from "lucide-react";

import { AcceptInviteForm } from "@/app/(public)/accept-invite/AcceptInviteForm";
import { getPendingInviteByToken } from "@/lib/auth/invites";
import { formatDateTime } from "@/lib/formatters";

function InvalidInvite() {
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-6">
      <section className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 text-center shadow-md">
        <span className="mx-auto grid size-10 shrink-0 place-items-center rounded-xl bg-[linear-gradient(180deg,var(--sidebar-from),var(--sidebar-to))] text-white">
          <ShieldX size={20} aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-page-title text-fg">Invite unavailable</h1>
        <p className="mt-3 text-sm leading-6 text-fg-muted">
          This invite link is invalid, expired, revoked, or already used.
        </p>
        <Link
          className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700"
          href="/sign-in"
        >
          Go to sign in
        </Link>
      </section>
    </main>
  );
}

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token: rawToken } = await searchParams;
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;

  if (!token) {
    return <InvalidInvite />;
  }

  const invite = await getPendingInviteByToken(token);

  if (!invite) {
    return <InvalidInvite />;
  }

  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-6">
      <section className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-md">
        <div className="mb-8 flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[linear-gradient(180deg,var(--sidebar-from),var(--sidebar-to))] text-white">
            <ShieldCheck size={20} aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-medium text-fg-subtle">UNIFY</p>
            <h1 className="text-page-title text-fg">Accept invite</h1>
          </div>
        </div>

        <p className="text-sm leading-6 text-fg-muted">
          Set your password to activate your admin portal account.
        </p>

        <AcceptInviteForm
          email={invite.email}
          expiresAtLabel={formatDateTime(invite.expiresAt.toISOString())}
          name={invite.name}
          role={invite.role}
          token={token}
        />
      </section>
    </main>
  );
}
