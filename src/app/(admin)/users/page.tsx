import { SectionHeader } from "@/components/layout/SectionHeader";
import { Badge } from "@/components/ui/Badge";
import { ADMIN_ROLES, ROLE_LABELS, type AdminRole } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { formatDateTime } from "@/lib/formatters";
import {
  changeUserRoleAction,
  deactivateUserAction,
  reactivateUserAction,
  revokeUserSessionsAction,
} from "./actions";
import { UserManagementTabs } from "./UserManagementTabs";

function getUserStatus(user: { banned: boolean | null }) {
  return user.banned ? "Deactivated" : "Active";
}

function getRoleLabel(role: string | null) {
  return ROLE_LABELS[role as AdminRole] ?? role ?? "Unknown";
}

export default async function UsersPage() {
  const session = await requireRole(["SUPER_ADMIN"]);
  const now = new Date();
  const users = await prisma.user.findMany({
    include: {
      sessions: {
        where: {
          expiresAt: {
            gt: now,
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return (
    <div className="space-y-8">
      <SectionHeader
        title="Admin users"
        description="Manage admin accounts, sessions, roles, and deactivation."
      />

      <UserManagementTabs active="users" />

      <section className="rounded-lg border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-950">Users</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-5 py-3 font-medium">User</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Active since</th>
                <th className="px-5 py-3 font-medium">Created</th>
                <th className="px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {users.map((user) => {
                const isCurrentUser = user.id === session.user.id;
                const activeSession = user.sessions[0];

                return (
                  <tr key={user.id}>
                    <td className="px-5 py-4">
                      <p className="font-medium text-zinc-950">{user.name}</p>
                      <p className="text-xs text-zinc-500">{user.email}</p>
                    </td>
                    <td className="px-5 py-4 text-zinc-600">
                      {isCurrentUser ? (
                        getRoleLabel(user.role)
                      ) : (
                        <form action={changeUserRoleAction} className="flex items-center gap-2">
                          <input name="userId" type="hidden" value={user.id} />
                          <select
                            className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm"
                            defaultValue={user.role ?? "VIEWER"}
                            name="role"
                          >
                            {ADMIN_ROLES.map((role) => (
                              <option key={role} value={role}>
                                {ROLE_LABELS[role]}
                              </option>
                            ))}
                          </select>
                          <button className="h-9 rounded-md border border-zinc-300 px-3 text-sm font-medium" type="submit">
                            Save
                          </button>
                        </form>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <Badge tone={user.banned ? "danger" : "success"}>{getUserStatus(user)}</Badge>
                    </td>
                    <td className="px-5 py-4 text-zinc-600">
                      {activeSession ? formatDateTime(activeSession.createdAt.toISOString()) : "No active session"}
                    </td>
                    <td className="px-5 py-4 text-zinc-600">{formatDateTime(user.createdAt.toISOString())}</td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-2">
                        {user.banned ? (
                          <form action={reactivateUserAction}>
                            <input name="userId" type="hidden" value={user.id} />
                            <button className="h-9 rounded-md border border-zinc-300 px-3 text-sm font-medium" type="submit">
                              Reactivate
                            </button>
                          </form>
                        ) : (
                          <form action={deactivateUserAction}>
                            <input name="userId" type="hidden" value={user.id} />
                            <button
                              className="h-9 rounded-md border border-zinc-300 px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={isCurrentUser}
                              title={isCurrentUser ? "You cannot deactivate your own account" : undefined}
                              type="submit"
                            >
                              Deactivate
                            </button>
                          </form>
                        )}
                        <form action={revokeUserSessionsAction}>
                          <input name="userId" type="hidden" value={user.id} />
                          <button className="h-9 rounded-md border border-zinc-300 px-3 text-sm font-medium" type="submit">
                            Revoke sessions
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

    </div>
  );
}
