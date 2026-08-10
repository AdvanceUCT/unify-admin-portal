/**
 * @fileoverview Renders the approved vendor page at `/vendor/staff`.
 * @module app/vendor/(portal)/staff/page
 */

import { Ban, RotateCcw } from "lucide-react";

import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { StatusText } from "@/components/ui/StatusText";
import { BranchMultiSelect } from "@/features/vendors/BranchMultiSelect";
import { StaffInviteForm } from "@/features/vendors/StaffInviteForm";
import { cn } from "@/lib/cn";
import { prisma } from "@/lib/db/prisma";
import { formatDateTime } from "@/lib/formatters";
import { requireVendorOwnerContext } from "@/lib/vendors/context";

import {
  revokeStaffInviteAction,
  setStaffActiveAction,
  updateStaffBranchesAction,
} from "./actions";

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
            <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-start sm:justify-between" key={member.id}>
              <div className="flex min-w-0 items-start gap-3">
                <Avatar name={member.user.name} />
                <div className="min-w-0">
                  <p className="font-medium text-fg">{member.user.name}</p>
                  <p className="text-sm text-fg-muted">{member.user.email}</p>
                  <StatusText className="mt-1.5 block" tone={member.active ? "success" : "danger"}>
                    {member.active ? "Active" : "Disabled"}
                  </StatusText>
                </div>
              </div>
              <div className="flex flex-col items-start gap-3 sm:items-end">
                <form
                  action={updateStaffBranchesAction}
                  className="flex flex-wrap items-center gap-2"
                >
                  <input name="membershipId" type="hidden" value={member.id} />
                  <BranchMultiSelect
                    branches={branches}
                    defaultSelectedIds={member.branches.map((item) => item.vendorBranchId)}
                    name="branchId"
                    submitOnApply
                  />
                </form>
                <form action={setStaffActiveAction}>
                  <input name="membershipId" type="hidden" value={member.id} />
                  <input
                    name="active"
                    type="hidden"
                    value={member.active ? "false" : "true"}
                  />
                  <button
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition",
                      member.active
                        ? "border-danger-border bg-danger-bg text-danger-fg hover:bg-danger-border"
                        : "border-success-border bg-success-bg text-success-fg hover:bg-success-border",
                    )}
                    type="submit"
                  >
                    {member.active ? <Ban aria-hidden="true" size={13} /> : <RotateCcw aria-hidden="true" size={13} />}
                    {member.active ? "Disable access" : "Reactivate access"}
                  </button>
                </form>
              </div>
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
