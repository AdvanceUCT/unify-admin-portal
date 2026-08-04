import { forbidden } from "next/navigation";
import { MapPin, QrCode, User } from "lucide-react";

import { SectionHeader } from "@/components/layout/SectionHeader";
import { Badge } from "@/components/ui/Badge";
import { requireVendorSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { formatDateTime } from "@/lib/formatters";
import { getVendorAccountContext } from "@/lib/vendors/account";
import {
  createSubVendorQrAction,
  deactivateSubVendorAction,
  reactivateSubVendorAction,
  revokeVendorInviteAction,
} from "./actions";
import { InviteLocationForm } from "./InviteLocationForm";

function inviteStatus(invite: {
  acceptedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
}) {
  if (invite.acceptedAt) return "Accepted";
  if (invite.revokedAt) return "Revoked";
  if (invite.expiresAt <= new Date()) return "Expired";
  return "Pending";
}

export default async function VendorLocationsPage() {
  const session = await requireVendorSession();
  const vendorContext = await getVendorAccountContext(session.user.id);

  if (!vendorContext?.canManageSubVendors) {
    forbidden();
  }

  const [locations, invites] = await Promise.all([
    prisma.vendorProfile.findMany({
      where: { parentVendorProfileId: vendorContext.profile.id },
      include: {
        user: {
          select: {
            name: true,
            email: true,
            banned: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.vendorInvite.findMany({
      where: { parentVendorProfileId: vendorContext.profile.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Locations"
        description="Invite and manage service locations under your parent vendor account."
      />

      <InviteLocationForm />

      <section className="rounded-lg border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-950">Active locations</h2>
        </div>
        <div className="divide-y divide-zinc-100">
          {locations.map((location) => (
            <div
              className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_auto]"
              key={location.id}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium text-zinc-950">
                    {location.locationName ?? location.companyName}
                  </h3>
                  <Badge tone={location.user.banned ? "danger" : "success"}>
                    {location.user.banned ? "Deactivated" : "Active"}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-zinc-600">
                  <span className="flex items-center gap-1.5">
                    <User className="size-3.5 shrink-0 text-zinc-400" />
                    {location.user.name} ({location.user.email})
                  </span>
                  {location.locationAddress ? (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="size-3.5 shrink-0 text-zinc-400" />
                      {location.locationAddress}
                    </span>
                  ) : null}
                </div>
                {location.verificationUrl ? (
                  <a
                    className="mt-2 block truncate text-xs font-medium text-blue-600 hover:underline"
                    href={location.verificationUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {location.verificationUrl}
                  </a>
                ) : (
                  <p className="mt-2 text-xs font-medium text-amber-700">
                    Verification QR setup pending.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-start gap-2 lg:justify-end">
                {!location.verificationUrl ? (
                  <form action={createSubVendorQrAction}>
                    <input name="vendorProfileId" type="hidden" value={location.id} />
                    <button
                      className="inline-flex h-9 items-center gap-1.5 rounded-md border border-zinc-300 px-3 text-sm font-medium"
                      type="submit"
                    >
                      <QrCode size={16} aria-hidden="true" />
                      Create QR
                    </button>
                  </form>
                ) : null}
                {location.user.banned ? (
                  <form action={reactivateSubVendorAction}>
                    <input name="vendorProfileId" type="hidden" value={location.id} />
                    <button className="h-9 rounded-md border border-zinc-300 px-3 text-sm font-medium" type="submit">
                      Reactivate
                    </button>
                  </form>
                ) : (
                  <form action={deactivateSubVendorAction}>
                    <input name="vendorProfileId" type="hidden" value={location.id} />
                    <button className="h-9 rounded-md border border-zinc-300 px-3 text-sm font-medium" type="submit">
                      Deactivate
                    </button>
                  </form>
                )}
              </div>
            </div>
          ))}
          {locations.length === 0 ? (
            <p className="px-5 py-6 text-sm text-zinc-500">No sub-vendor locations yet.</p>
          ) : null}
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-950">Recent invites</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-5 py-3 font-medium">Invitee</th>
                <th className="px-5 py-3 font-medium">Location</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Expires</th>
                <th className="px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {invites.map((invite) => {
                const status = inviteStatus(invite);
                return (
                  <tr key={invite.id}>
                    <td className="px-5 py-4">
                      <p className="font-medium text-zinc-950">{invite.name}</p>
                      <p className="text-xs text-zinc-500">{invite.email}</p>
                    </td>
                    <td className="px-5 py-4 text-zinc-600">{invite.locationName}</td>
                    <td className="px-5 py-4">
                      <Badge tone={status === "Pending" ? "warning" : status === "Accepted" ? "success" : "neutral"}>
                        {status}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-zinc-600">
                      {formatDateTime(invite.expiresAt.toISOString())}
                    </td>
                    <td className="px-5 py-4">
                      {status === "Pending" ? (
                        <form action={revokeVendorInviteAction}>
                          <input name="inviteId" type="hidden" value={invite.id} />
                          <button className="h-9 rounded-md border border-zinc-300 px-3 text-sm font-medium" type="submit">
                            Revoke
                          </button>
                        </form>
                      ) : (
                        <span className="text-zinc-400">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {invites.length === 0 ? (
                <tr>
                  <td className="px-5 py-6 text-sm text-zinc-500" colSpan={5}>
                    No invites yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
