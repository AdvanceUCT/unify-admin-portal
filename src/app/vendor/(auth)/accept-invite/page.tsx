/**
 * @fileoverview Renders the vendor authentication page at `/vendor/accept-invite`.
 * @module app/vendor/(auth)/accept-invite/page
 */

import { Landmark, ShieldX } from "lucide-react";

import { formatDateTime } from "@/lib/formatters";
import { getPendingVendorStaffInvite } from "@/lib/vendors/staff";

import { AcceptVendorInviteForm } from "./AcceptVendorInviteForm";

function InvalidInvite() {
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-6" data-portal="vendor">
      <section className="w-full max-w-md rounded-xl border border-border bg-surface p-6 text-center shadow-md">
        <span className="mx-auto grid size-10 shrink-0 place-items-center rounded-xl bg-[linear-gradient(180deg,var(--sidebar-from),var(--sidebar-to))] text-white">
          <ShieldX size={20} aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-page-title text-fg">Invite unavailable</h1>
        <p className="mt-3 text-sm leading-6 text-fg-muted">
          This staff invite is invalid, expired, revoked, or already used.
        </p>
      </section>
    </main>
  );
}

export default async function AcceptVendorInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const raw = (await searchParams).token;
  const token = Array.isArray(raw) ? raw[0] : raw;
  const invite = token ? await getPendingVendorStaffInvite(token) : null;

  if (!invite || !token) {
    return <InvalidInvite />;
  }

  const branchNames = invite.branches.map((item) => item.vendorBranch.name).join(", ");

  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-6 py-10" data-portal="vendor">
      <section className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-md">
        <div className="mb-8 flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[linear-gradient(180deg,var(--sidebar-from),var(--sidebar-to))] text-white">
            <Landmark size={20} aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-medium text-fg-subtle">UNIFY</p>
            <h1 className="text-page-title text-fg">Join {invite.vendorProfile.companyName}</h1>
          </div>
        </div>

        <p className="text-sm leading-6 text-fg-muted">
          Create your branch staff account to get started.
        </p>

        <div className="mt-6 rounded-md border border-border bg-surface-muted px-3 py-3 text-sm text-fg-muted">
          <p>
            <span className="font-medium text-fg">{invite.name}</span> ({invite.email})
          </p>
          <p className="mt-1">
            Branches: {branchNames} · Expires: {formatDateTime(invite.expiresAt.toISOString())}
          </p>
        </div>

        <AcceptVendorInviteForm token={token} />
      </section>
    </main>
  );
}
