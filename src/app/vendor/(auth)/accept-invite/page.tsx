import { formatDateTime } from "@/lib/formatters";
import { getPendingVendorStaffInvite } from "@/lib/vendors/staff";

import { AcceptVendorInviteForm } from "./AcceptVendorInviteForm";

export default async function AcceptVendorInvitePage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const raw = (await searchParams).token;
  const token = Array.isArray(raw) ? raw[0] : raw;
  const invite = token ? await getPendingVendorStaffInvite(token) : null;
  return <main className="grid min-h-screen place-items-center bg-zinc-50 px-4 py-10">
    <section className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      {!invite || !token ? <><h1 className="text-xl font-semibold text-zinc-950">Invite unavailable</h1><p className="mt-2 text-sm text-zinc-600">This staff invite is invalid, expired, revoked, or already used.</p></> : <><h1 className="text-xl font-semibold text-zinc-950">Join {invite.vendorProfile.companyName}</h1><p className="mt-2 text-sm text-zinc-600">Create your branch staff account for {invite.branches.map((item) => item.vendorBranch.name).join(", ")}. This invite expires {formatDateTime(invite.expiresAt.toISOString())}.</p><AcceptVendorInviteForm token={token} /></>}
    </section>
  </main>;
}
