import "server-only";

import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { AuditAction } from "@/generated/prisma/enums";
import { auth } from "@/lib/auth/auth";
import { createInviteToken, hashInviteToken } from "@/lib/auth/invites";
import { writeAuditLog } from "@/lib/audit/audit";
import { env } from "@/lib/config/env";
import { prisma } from "@/lib/db/prisma";
import { sendVendorStaffInviteEmail } from "@/lib/email/vendor-staff-invites";

const createStaffInviteSchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().min(1).max(100),
  branchIds: z.array(z.string().min(1)).min(1, "Select at least one branch."),
});

const acceptStaffInviteSchema = z
  .object({
    token: z.string().min(1),
    password: z.string().min(12, "Password must be at least 12 characters."),
    confirmPassword: z.string().min(1),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

function sameHash(left: string, right: string) {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

async function validateBranches(vendorProfileId: string, branchIds: string[]) {
  const uniqueIds = [...new Set(branchIds)];
  if (uniqueIds.length === 0) throw new Error("Select at least one branch.");
  const branches = await prisma.vendorBranch.findMany({
    where: { id: { in: uniqueIds }, vendorProfileId, active: true },
    select: { id: true },
  });
  if (branches.length !== uniqueIds.length) throw new Error("One or more selected branches are unavailable.");
  return uniqueIds;
}

export async function createVendorStaffInvite(
  vendorProfileId: string,
  createdByUserId: string,
  input: { email: string; name: string; branchIds: string[] },
) {
  const data = createStaffInviteSchema.parse(input);
  const branchIds = await validateBranches(vendorProfileId, data.branchIds);
  const email = data.email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) {
    throw new Error("That email is already registered in UNIFY.");
  }

  const vendor = await prisma.vendorProfile.findUnique({ where: { id: vendorProfileId } });
  if (!vendor) throw new Error("Vendor was not found.");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + env.ADMIN_INVITE_TTL_HOURS * 60 * 60 * 1000);
  const token = createInviteToken();
  const tokenHash = hashInviteToken(token);

  await prisma.vendorStaffInvite.updateMany({
    where: { vendorProfileId, email, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
    data: { revokedAt: now, revokedByUserId: createdByUserId },
  });
  const invite = await prisma.vendorStaffInvite.create({
    data: {
      vendorProfileId,
      createdByUserId,
      email,
      name: data.name,
      tokenHash,
      expiresAt,
      branches: { create: branchIds.map((vendorBranchId) => ({ vendorBranchId })) },
    },
  });
  const inviteUrl = new URL("/vendor/accept-invite", env.APP_URL);
  inviteUrl.searchParams.set("token", token);
  await writeAuditLog({
    action: AuditAction.VENDOR_STAFF_INVITE_CREATED,
    actorId: createdByUserId,
    targetType: "vendor_staff_invite",
    targetId: invite.id,
    meta: {
      vendorProfileId,
      email,
      branchCount: branchIds.length,
      branchIds: branchIds.join(","),
    },
  });
  await sendVendorStaffInviteEmail({
    to: email,
    name: invite.name,
    vendorName: vendor.companyName,
    inviteUrl: inviteUrl.toString(),
    expiresAt,
  });
  return invite;
}

export async function getPendingVendorStaffInvite(token: string) {
  const tokenHash = hashInviteToken(token);
  const invite = await prisma.vendorStaffInvite.findUnique({
    where: { tokenHash },
    include: { vendorProfile: { select: { companyName: true } }, branches: { include: { vendorBranch: true } } },
  });
  if (!invite || !sameHash(invite.tokenHash, tokenHash)) return null;
  if (invite.acceptedAt || invite.revokedAt || invite.expiresAt <= new Date()) return null;
  return invite;
}

export async function acceptVendorStaffInvite(input: z.input<typeof acceptStaffInviteSchema>) {
  const data = acceptStaffInviteSchema.parse(input);
  const invite = await getPendingVendorStaffInvite(data.token);
  if (!invite) throw new Error("This invite link is invalid or has expired.");
  if (await prisma.user.findUnique({ where: { email: invite.email } })) {
    throw new Error("That email is already registered in UNIFY.");
  }

  const claimed = await prisma.vendorStaffInvite.updateMany({
    where: { id: invite.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    data: { acceptedAt: new Date() },
  });
  if (claimed.count !== 1) throw new Error("This invite link is invalid or has expired.");

  let createdUserId: string | undefined;
  try {
    const result = await auth.api.createUser({
      body: {
        email: invite.email,
        name: invite.name,
        password: data.password,
        data: { emailVerified: true, userType: "VENDOR" },
      },
    });
    createdUserId = result.user.id;
    await prisma.$transaction(async (tx) => {
      const membership = await tx.vendorMembership.create({
        data: { vendorProfileId: invite.vendorProfileId, userId: result.user.id, role: "STAFF" },
      });
      await tx.vendorBranchMembership.createMany({
        data: invite.branches.map(({ vendorBranchId }) => ({
          vendorMembershipId: membership.id,
          vendorBranchId,
        })),
      });
      await tx.vendorStaffInvite.update({
        where: { id: invite.id },
        data: { acceptedByUserId: result.user.id },
      });
      await writeAuditLog(
        {
          action: AuditAction.VENDOR_STAFF_INVITE_ACCEPTED,
          actorId: result.user.id,
          targetType: "vendor_staff_invite",
          targetId: invite.id,
          meta: {
            vendorProfileId: invite.vendorProfileId,
            membershipId: membership.id,
            branchCount: invite.branches.length,
          },
        },
        tx,
      );
    });
    return result.user;
  } catch (error) {
    if (createdUserId) {
      await prisma.user.deleteMany({ where: { id: createdUserId } });
    }
    await prisma.vendorStaffInvite.updateMany({
      where: { id: invite.id, acceptedByUserId: null },
      data: { acceptedAt: null },
    });
    throw error;
  }
}

export async function updateVendorStaffBranches(
  vendorProfileId: string,
  membershipId: string,
  actorUserId: string,
  branchIds: string[],
) {
  const validIds = await validateBranches(vendorProfileId, branchIds);
  const membership = await prisma.vendorMembership.findFirst({
    where: { id: membershipId, vendorProfileId, role: "STAFF" },
  });
  if (!membership) throw new Error("Staff member was not found.");
  await prisma.$transaction([
    prisma.vendorBranchMembership.deleteMany({ where: { vendorMembershipId: membership.id } }),
    prisma.vendorBranchMembership.createMany({
      data: validIds.map((vendorBranchId) => ({ vendorMembershipId: membership.id, vendorBranchId })),
    }),
  ]);
  await writeAuditLog({
    action: AuditAction.VENDOR_STAFF_BRANCH_ACCESS_UPDATED,
    actorId: actorUserId,
    targetType: "vendor_membership",
    targetId: membership.id,
    meta: {
      vendorProfileId,
      staffUserId: membership.userId,
      branchCount: validIds.length,
      branchIds: validIds.join(","),
    },
  });
}

export async function setVendorStaffActive(
  vendorProfileId: string,
  membershipId: string,
  actorUserId: string,
  active: boolean,
) {
  const membership = await prisma.vendorMembership.findFirst({
    where: { id: membershipId, vendorProfileId, role: "STAFF" },
  });
  if (!membership) throw new Error("Staff member was not found.");
  await prisma.vendorMembership.update({ where: { id: membership.id }, data: { active } });
  if (!active) await prisma.session.deleteMany({ where: { userId: membership.userId } });
  await writeAuditLog({
    action: AuditAction.VENDOR_STAFF_STATUS_CHANGED,
    actorId: actorUserId,
    targetType: "vendor_membership",
    targetId: membership.id,
    meta: {
      vendorProfileId,
      staffUserId: membership.userId,
      active,
    },
  });
}

export async function revokeVendorStaffInvite(vendorProfileId: string, inviteId: string, revokedByUserId: string) {
  const result = await prisma.vendorStaffInvite.updateMany({
    where: { id: inviteId, vendorProfileId, acceptedAt: null, revokedAt: null },
    data: { revokedAt: new Date(), revokedByUserId },
  });
  if (result.count !== 1) throw new Error("Pending invite was not found.");
  await writeAuditLog({
    action: AuditAction.VENDOR_STAFF_INVITE_REVOKED,
    actorId: revokedByUserId,
    targetType: "vendor_staff_invite",
    targetId: inviteId,
    meta: { vendorProfileId },
  });
}
