import Link from "next/link";
import { MapPin } from "lucide-react";

import { formatDateTime } from "@/lib/formatters";
import { getPendingVendorInviteByToken } from "@/lib/vendors/invites";
import { AcceptVendorInviteForm } from "./AcceptVendorInviteForm";

function InvalidInvite() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f8fa] px-6">
      <section className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-zinc-950">Invite unavailable</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          This invite link is invalid, expired, revoked, or already used.
        </p>
        <Link
          className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800"
          href="/vendor/sign-in"
        >
          Go to vendor sign in
        </Link>
      </section>
    </main>
  );
}

export default async function AcceptVendorInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token: rawToken } = await searchParams;
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;

  if (!token) {
    return <InvalidInvite />;
  }

  const invite = await getPendingVendorInviteByToken(token);

  if (!invite) {
    return <InvalidInvite />;
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f8fa] px-6">
      <section className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="mb-8 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-md bg-zinc-950 text-white">
            <MapPin size={20} aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-medium text-zinc-500">UNIFY</p>
            <h1 className="text-xl font-semibold text-zinc-950">Accept vendor invite</h1>
          </div>
        </div>

        <p className="text-sm leading-6 text-zinc-600">
          Set your password to activate your location account.
        </p>

        <AcceptVendorInviteForm
          companyName={invite.parentVendorProfile.companyName}
          email={invite.email}
          expiresAtLabel={formatDateTime(invite.expiresAt.toISOString())}
          locationName={invite.locationName}
          name={invite.name}
          token={token}
        />
      </section>
    </main>
  );
}
