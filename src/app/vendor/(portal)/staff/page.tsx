import { Badge } from "@/components/ui/Badge";
import { StaffInviteForm } from "@/features/vendors/StaffInviteForm";
import { prisma } from "@/lib/db/prisma";
import { formatDateTime } from "@/lib/formatters";
import { requireVendorOwnerContext } from "@/lib/vendors/context";

import {
  revokeStaffInviteAction,
  setStaffActiveAction,
  updateStaffBranchesAction,
} from "./actions";

const secondaryButtonClassName =
  "h-8 rounded-md border border-border bg-surface px-3 text-xs font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg";

export default async function VendorStaffPage() {
  const { context } = await requireVendorOwnerContext();
  const [branches, staff, invites] = await Promise.all([
    prisma.vendorBranch.findMany({
      where: { vendorProfileId: context.vendorProfileId, active: true },
      orderBy: { name: "asc" },
    }),
    prisma.vendorMembership.findMany({
      where: { vendorProfileId: context.vendorProfileId, role: "STAFF" },
      include: { user: true, branches: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.vendorStaffInvite.findMany({
      where: { vendorProfileId: context.vendorProfileId },
      include: { branches: { include: { vendorBranch: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-surface p-5 shadow-md">
        <h2 className="mb-4 text-section-title text-fg">Invite staff member</h2>
        <StaffInviteForm
          branches={branches.map(({ id, name }) => ({ id, name }))}
        />
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-section-title text-fg">Staff accounts</h2>
        </div>
        <div className="divide-y divide-border">
          {staff.map((member) => (
            <div className="space-y-3 px-5 py-4" key={member.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-fg">{member.user.name}</p>
                  <p className="text-sm text-fg-muted">{member.user.email}</p>
                </div>
                <Badge tone={member.active ? "success" : "danger"}>
                  {member.active ? "Active" : "Disabled"}
                </Badge>
              </div>
              <form
                action={updateStaffBranchesAction}
                className="flex flex-wrap items-center gap-3"
              >
                <input name="membershipId" type="hidden" value={member.id} />
                {branches.map((branch) => (
                  <label
                    className="flex items-center gap-1.5 text-sm text-fg-muted"
                    key={branch.id}
                  >
                    <input
                      defaultChecked={member.branches.some(
                        (item) => item.vendorBranchId === branch.id,
                      )}
                      name="branchId"
                      type="checkbox"
                      value={branch.id}
                    />
                    {branch.name}
                  </label>
                ))}
                <button className={secondaryButtonClassName} type="submit">
                  Save assignments
                </button>
              </form>
              <form action={setStaffActiveAction}>
                <input name="membershipId" type="hidden" value={member.id} />
                <input
                  name="active"
                  type="hidden"
                  value={member.active ? "false" : "true"}
                />
                <button
                  className="text-xs font-medium text-fg-muted underline underline-offset-2 hover:text-fg"
                  type="submit"
                >
                  {member.active ? "Disable access" : "Reactivate access"}
                </button>
              </form>
            </div>
          ))}
          {staff.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-fg-subtle">
              No staff accounts yet.
            </p>
          ) : null}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-section-title text-fg">Recent invitations</h2>
        </div>
        <div className="divide-y divide-border">
          {invites.map((invite) => {
            const pending =
              !invite.acceptedAt &&
              !invite.revokedAt &&
              invite.expiresAt > new Date();
            const label = invite.acceptedAt
              ? "Accepted"
              : invite.revokedAt
                ? "Revoked"
                : invite.expiresAt <= new Date()
                  ? "Expired"
                  : "Pending";
            return (
              <div
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                key={invite.id}
              >
                <div>
                  <p className="font-medium text-fg">
                    {invite.name} / {invite.email}
                  </p>
                  <p className="text-xs text-fg-subtle">
                    {invite.branches
                      .map((item) => item.vendorBranch.name)
                      .join(", ")}{" "}
                    / expires {formatDateTime(invite.expiresAt.toISOString())}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge
                    tone={
                      label === "Accepted"
                        ? "success"
                        : label === "Pending"
                          ? "warning"
                          : "danger"
                    }
                  >
                    {label}
                  </Badge>
                  {pending ? (
                    <form action={revokeStaffInviteAction}>
                      <input name="inviteId" type="hidden" value={invite.id} />
                      <button
                        className="text-xs font-medium text-danger-fg underline underline-offset-2"
                        type="submit"
                      >
                        Revoke
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
            );
          })}
          {invites.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-fg-subtle">
              No invitations yet.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
