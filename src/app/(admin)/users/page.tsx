import { Ban, LogOut, RotateCcw } from "lucide-react";

import { PageTabs } from "@/components/layout/PageTabs";
import { StatusText } from "@/components/ui/StatusText";
import { ROLE_LABELS, type AdminRole } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { formatDateTime } from "@/lib/formatters";
import {
  changeUserRoleAction,
  deactivateUserAction,
  reactivateUserAction,
  revokeUserSessionsAction,
} from "./actions";
import { ChangeRoleButton } from "./ChangeRoleButton";

function getRoleLabel(role: string | null) {
  return ROLE_LABELS[role as AdminRole] ?? role ?? "Unknown";
}

export default async function UsersPage() {
  const session = await requireRole(["SUPER_ADMIN"]);
  const now = new Date();
  const users = await prisma.user.findMany({
    where: {
      userType: "ADMIN",
    },
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
    <div className="space-y-6">
      <PageTabs
        tabs={[
          { href: "/users", isActive: true, label: "Users" },
          { href: "/users/invites", isActive: false, label: "Invites" },
        ]}
      />

      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <div className="overflow-x-auto">
          <table className="w-full text-center text-body">
            <thead className="border-b border-border">
              <tr className="whitespace-nowrap text-caption uppercase tracking-wide text-fg-subtle">
                <th className="px-5 py-3 font-medium">User</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Active since</th>
                <th className="px-5 py-3 font-medium">Created</th>
                <th className="px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.length === 0 ? (
                <tr>
                  <td className="px-5 py-10 text-fg-subtle" colSpan={6}>
                    No admin users found.
                  </td>
                </tr>
              ) : null}
              {users.map((user) => {
                const isCurrentUser = user.id === session.user.id;
                const isSuperAdmin = user.role === "SUPER_ADMIN";
                const activeSession = user.sessions[0];

                return (
                  <tr className="transition hover:bg-surface-muted/60" key={user.id}>
                    <td className="px-5 py-4">
                      <p className="font-medium text-fg">{user.name}</p>
                      <p className="text-xs text-fg-subtle">{user.email}</p>
                    </td>
                    <td className="px-5 py-4">
                      {isCurrentUser || isSuperAdmin ? (
                        <span className="text-fg-muted">{getRoleLabel(user.role)}</span>
                      ) : (
                        <ChangeRoleButton
                          action={changeUserRoleAction}
                          currentRole={(user.role as AdminRole | null) ?? "VIEWER"}
                          userId={user.id}
                        />
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <StatusText tone={user.banned ? "danger" : "success"}>
                        {user.banned ? "Deactivated" : "Active"}
                      </StatusText>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-fg-muted">
                      {activeSession ? formatDateTime(activeSession.createdAt.toISOString()) : "No active session"}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-fg-muted">
                      {formatDateTime(user.createdAt.toISOString())}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col items-stretch gap-1.5">
                        {user.banned ? (
                          <form action={reactivateUserAction}>
                            <input name="userId" type="hidden" value={user.id} />
                            <button
                              className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-success-border bg-success-bg px-2.5 text-xs font-medium text-success-fg transition hover:bg-success-border"
                              type="submit"
                            >
                              <RotateCcw aria-hidden className="size-3.5" />
                              Reactivate
                            </button>
                          </form>
                        ) : (
                          <form action={deactivateUserAction}>
                            <input name="userId" type="hidden" value={user.id} />
                            <button
                              className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-danger-border bg-danger-bg px-2.5 text-xs font-medium text-danger-fg transition hover:bg-danger-border disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={isCurrentUser}
                              title={isCurrentUser ? "You cannot deactivate your own account" : undefined}
                              type="submit"
                            >
                              <Ban aria-hidden className="size-3.5" />
                              Deactivate
                            </button>
                          </form>
                        )}
                        <form action={revokeUserSessionsAction}>
                          <input name="userId" type="hidden" value={user.id} />
                          <button
                            className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-xs font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg"
                            type="submit"
                          >
                            <LogOut aria-hidden className="size-3.5" />
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
