import { SectionHeader } from "@/components/layout/SectionHeader";
import { getInviteRoleLabel } from "@/lib/auth/invites";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { formatDateTime } from "@/lib/formatters";
import { revokeInviteAction } from "../actions";
import { UserManagementTabs } from "../UserManagementTabs";
import { InviteForm } from "./InviteForm";

function getInviteStatus(invite: {
  acceptedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
}) {
  if (invite.acceptedAt) {
    return "Accepted";
  }

  if (invite.revokedAt) {
    return "Revoked";
  }

  if (invite.expiresAt <= new Date()) {
    return "Expired";
  }

  return "Pending";
}

export default async function AdminInvitesPage() {
  await requireRole(["SUPER_ADMIN"]);

  const invites = await prisma.adminInvite.findMany({
    orderBy: {
      createdAt: "desc",
    },
    take: 50,
  });

  return (
    <div className="space-y-8">
      <SectionHeader
        title="Admin users"
        description="Manage admin accounts and invite admins from one user-management area."
      />

      <UserManagementTabs active="invites" />

      <section className="space-y-4">
        <SectionHeader
          title="Invite admin"
          description="Invite admins into the portal. Development invite links are logged to the server console."
        />
        <InviteForm />
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
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Expires</th>
                <th className="px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {invites.map((invite) => {
                const status = getInviteStatus(invite);

                return (
                  <tr key={invite.id}>
                    <td className="px-5 py-4">
                      <p className="font-medium text-zinc-950">{invite.name}</p>
                      <p className="text-xs text-zinc-500">{invite.email}</p>
                    </td>
                    <td className="px-5 py-4 text-zinc-600">{getInviteRoleLabel(invite.role)}</td>
                    <td className="px-5 py-4 text-zinc-600">{status}</td>
                    <td className="px-5 py-4 text-zinc-600">{formatDateTime(invite.expiresAt.toISOString())}</td>
                    <td className="px-5 py-4">
                      {status === "Pending" ? (
                        <form action={revokeInviteAction}>
                          <input name="inviteId" type="hidden" value={invite.id} />
                          <button className="h-9 rounded-md border border-zinc-300 px-3 text-sm font-medium" type="submit">
                            Revoke
                          </button>
                        </form>
                      ) : (
                        <span className="text-zinc-400">None</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {invites.length === 0 ? (
                <tr>
                  <td className="px-5 py-6 text-zinc-500" colSpan={5}>
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
