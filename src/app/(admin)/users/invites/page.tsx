/**
 * @fileoverview Renders the authenticated administrator page at `/users/invites`.
 * @module app/(admin)/users/invites/page
 */

import { PageTabs } from "@/components/layout/PageTabs";
import { StatusText, type StatusTone } from "@/components/ui/StatusText";
import { getInviteRoleLabel } from "@/lib/auth/invites";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { formatDateTime } from "@/lib/formatters";
import { revokeInviteAction } from "../actions";
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

const statusTone: Record<ReturnType<typeof getInviteStatus>, StatusTone> = {
  Accepted: "success",
  Pending: "warning",
  Revoked: "danger",
  Expired: "danger",
};

export default async function AdminInvitesPage() {
  await requireRole(["SUPER_ADMIN"]);

  const invites = await prisma.adminInvite.findMany({
    orderBy: {
      createdAt: "desc",
    },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <PageTabs
        tabs={[
          { href: "/users", isActive: false, label: "Users" },
          { href: "/users/invites", isActive: true, label: "Invites" },
        ]}
      />

      <section className="rounded-xl border border-border bg-surface p-5 shadow-md">
        <h2 className="text-section-title text-fg">Invite admin</h2>
        <p className="mt-1 text-sm text-fg-subtle">
          Invite admins into the portal. Development invite links are logged to the server console.
        </p>
        <div className="mt-4">
          <InviteForm />
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-section-title text-fg">Recent invites</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-center text-body">
            <thead className="border-b border-border">
              <tr className="whitespace-nowrap text-caption uppercase tracking-wide text-fg-subtle">
                <th className="px-5 py-3 font-medium">Invitee</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Expires</th>
                <th className="px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {invites.length === 0 ? (
                <tr>
                  <td className="px-5 py-10 text-fg-subtle" colSpan={5}>
                    No invites yet.
                  </td>
                </tr>
              ) : (
                invites.map((invite) => {
                  const status = getInviteStatus(invite);

                  return (
                    <tr className="transition hover:bg-surface-muted/60" key={invite.id}>
                      <td className="px-5 py-4">
                        <p className="font-medium text-fg">{invite.name}</p>
                        <p className="text-xs text-fg-subtle">{invite.email}</p>
                      </td>
                      <td className="px-5 py-4 text-fg-muted">{getInviteRoleLabel(invite.role)}</td>
                      <td className="px-5 py-4">
                        <StatusText tone={statusTone[status]}>{status}</StatusText>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-fg-muted">
                        {formatDateTime(invite.expiresAt.toISOString())}
                      </td>
                      <td className="px-5 py-4">
                        {status === "Pending" ? (
                          <form action={revokeInviteAction}>
                            <input name="inviteId" type="hidden" value={invite.id} />
                            <button
                              className="h-9 rounded-md border border-border bg-surface px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg"
                              type="submit"
                            >
                              Revoke
                            </button>
                          </form>
                        ) : (
                          <span className="text-fg-subtle">None</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
