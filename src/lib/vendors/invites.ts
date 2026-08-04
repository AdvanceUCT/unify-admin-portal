import "server-only";

import { z } from "zod";

import { AuditAction } from "@/generated/prisma/enums";
import { auth } from "@/lib/auth/auth";
import {
  createInviteToken,
  hashInviteToken,
  isSameTokenHash,
} from "@/lib/auth/invite-tokens";
import { writeAuditLog } from "@/lib/audit/audit";
import { env } from "@/lib/config/env";
import { prisma } from "@/lib/db/prisma";
import { sendVendorInviteEmail } from "@/lib/email/vendor-invites";
import { ensureVendorVerificationServicePoint } from "@/lib/vendors/applications";

const createVendorInviteSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().min(1, "Name is required"),
  locationName: z.string().trim().min(1, "Location name is required"),
  locationAddress: z.string().trim().max(500).optional(),
});

const acceptVendorInviteSchema = z
  .object({
    token: z.string().min(1, "Invite token is required"),
    password: z.string().min(12, "Password must be at least 12 characters"),
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type CreateVendorInviteInput = z.input<typeof createVendorInviteSchema>;
export type AcceptVendorInviteInput = z.input<typeof acceptVendorInviteSchema>;

function buildInviteUrl(token: string) {
  const inviteUrl = new URL("/vendor/accept-invite", env.APP_URL);
  inviteUrl.searchParams.set("token", token);

  return inviteUrl.toString();
}

async function auditExpiredVendorInviteOnce(invite: {
  id: string;
  email: string;
  expiresAt: Date;
  parentVendorProfileId: string;
}) {
  const existingAuditLog = await prisma.auditLog.findFirst({
    where: {
      action: AuditAction.VENDOR_INVITE_EXPIRED,
      targetType: "vendor_invite",
      targetId: invite.id,
    },
    select: { id: true },
  });

  if (existingAuditLog) {
    return;
  }

  await writeAuditLog({
    action: AuditAction.VENDOR_INVITE_EXPIRED,
    targetType: "vendor_invite",
    targetId: invite.id,
    meta: {
      email: invite.email,
      parentVendorProfileId: invite.parentVendorProfileId,
      expiresAt: invite.expiresAt.toISOString(),
    },
  });
}

export async function createVendorInvite({
  input,
  createdByUserId,
  parentVendorProfileId,
  request,
}: {
  input: CreateVendorInviteInput;
  createdByUserId: string;
  parentVendorProfileId: string;
  request?: Request | null;
}) {
  const data = createVendorInviteSchema.parse(input);
  const email = data.email.toLowerCase();
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + env.ADMIN_INVITE_TTL_HOURS * 60 * 60 * 1000,
  );
  const token = createInviteToken();
  const tokenHash = hashInviteToken(token);
  const inviteUrl = buildInviteUrl(token);

  const [parentProfile, existingUser] = await Promise.all([
    prisma.vendorProfile.findFirst({
      where: { id: parentVendorProfileId, parentVendorProfileId: null },
      select: {
        id: true,
        companyName: true,
        serviceCategory: true,
      },
    }),
    prisma.user.findUnique({
      where: { email },
      select: { id: true },
    }),
  ]);

  if (!parentProfile) {
    throw new Error("Only parent vendor accounts can invite locations.");
  }

  if (existingUser) {
    throw new Error("A user with this email already exists.");
  }

  const revokedPendingInvites = await prisma.vendorInvite.updateMany({
    where: {
      parentVendorProfileId,
      email,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    data: {
      revokedAt: now,
      revokedByUserId: createdByUserId,
    },
  });

  if (revokedPendingInvites.count > 0) {
    await writeAuditLog({
      action: AuditAction.VENDOR_INVITE_REVOKED,
      actorId: createdByUserId,
      targetType: "vendor_invite",
      targetId: email,
      meta: {
        reason: "superseded",
        count: revokedPendingInvites.count,
        parentVendorProfileId,
      },
      request,
    });
  }

  const invite = await prisma.vendorInvite.create({
    data: {
      email,
      name: data.name,
      locationName: data.locationName,
      locationAddress: data.locationAddress || null,
      tokenHash,
      expiresAt,
      parentVendorProfileId,
      createdByUserId,
    },
  });

  await sendVendorInviteEmail({
    to: invite.email,
    name: invite.name,
    companyName: parentProfile.companyName,
    locationName: invite.locationName,
    inviteUrl,
    expiresAt: invite.expiresAt,
  });

  await writeAuditLog({
    action: AuditAction.VENDOR_INVITE_CREATED,
    actorId: createdByUserId,
    targetType: "vendor_invite",
    targetId: invite.id,
    meta: {
      email: invite.email,
      locationName: invite.locationName,
      parentVendorProfileId,
    },
    request,
  });

  return invite;
}

export async function getPendingVendorInviteByToken(token: string) {
  const tokenHash = hashInviteToken(token);
  const invite = await prisma.vendorInvite.findUnique({
    where: { tokenHash },
    include: {
      parentVendorProfile: {
        select: {
          companyName: true,
          serviceCategory: true,
        },
      },
    },
  });

  if (!invite || !isSameTokenHash(invite.tokenHash, tokenHash)) {
    return null;
  }

  const now = new Date();

  if (invite.expiresAt <= now && !invite.acceptedAt && !invite.revokedAt) {
    await auditExpiredVendorInviteOnce(invite);
  }

  if (invite.acceptedAt || invite.revokedAt || invite.expiresAt <= now) {
    return null;
  }

  return invite;
}

export async function acceptVendorInvite(input: AcceptVendorInviteInput) {
  const data = acceptVendorInviteSchema.parse(input);
  const tokenHash = hashInviteToken(data.token);
  const invite = await prisma.vendorInvite.findUnique({
    where: { tokenHash },
    include: {
      parentVendorProfile: {
        select: {
          id: true,
          companyName: true,
          serviceCategory: true,
          website: true,
        },
      },
    },
  });

  if (!invite || !isSameTokenHash(invite.tokenHash, tokenHash)) {
    throw new Error("This invite link is invalid or has expired.");
  }

  const now = new Date();

  if (invite.expiresAt <= now && !invite.acceptedAt && !invite.revokedAt) {
    await auditExpiredVendorInviteOnce(invite);
  }

  if (invite.acceptedAt || invite.revokedAt || invite.expiresAt <= now) {
    throw new Error("This invite link is invalid or has expired.");
  }

  const claimed = await prisma.vendorInvite.updateMany({
    where: {
      id: invite.id,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    data: {
      acceptedAt: now,
    },
  });

  if (claimed.count !== 1) {
    throw new Error("This invite link is invalid or has expired.");
  }

  const result = await auth.api.createUser({
    body: {
      email: invite.email,
      name: invite.name,
      password: data.password,
      data: {
        emailVerified: true,
        userType: "VENDOR",
      },
    },
  });

  const profile = await prisma.$transaction(async (transaction) => {
    await transaction.vendorInvite.update({
      where: { id: invite.id },
      data: {
        acceptedByUserId: result.user.id,
      },
    });

    const createdProfile = await transaction.vendorProfile.create({
      data: {
        userId: result.user.id,
        parentVendorProfileId: invite.parentVendorProfileId,
        companyName: invite.parentVendorProfile.companyName,
        serviceCategory: invite.parentVendorProfile.serviceCategory,
        website: invite.parentVendorProfile.website,
        contactPersonName: invite.name,
        contactEmail: invite.email,
        locationName: invite.locationName,
        locationAddress: invite.locationAddress,
      },
      select: { id: true },
    });

    await writeAuditLog(
      {
        action: AuditAction.VENDOR_INVITE_ACCEPTED,
        actorId: result.user.id,
        targetType: "vendor_invite",
        targetId: invite.id,
        meta: {
          email: invite.email,
          locationName: invite.locationName,
          parentVendorProfileId: invite.parentVendorProfileId,
          vendorProfileId: createdProfile.id,
        },
      },
      transaction,
    );

    return createdProfile;
  });

  try {
    await ensureVendorVerificationServicePoint(profile.id);
  } catch (error) {
    console.error(
      `[verification] Failed to create service point for sub-vendor ${profile.id}:`,
      error instanceof Error ? error.message : String(error),
    );
  }

  return result.user;
}

export async function revokeVendorInvite({
  inviteId,
  parentVendorProfileId,
  revokedByUserId,
}: {
  inviteId: string;
  parentVendorProfileId: string;
  revokedByUserId: string;
}) {
  const invite = await prisma.vendorInvite.update({
    where: {
      id: inviteId,
      parentVendorProfileId,
      acceptedAt: null,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
      revokedByUserId,
    },
  });

  await writeAuditLog({
    action: AuditAction.VENDOR_INVITE_REVOKED,
    actorId: revokedByUserId,
    targetType: "vendor_invite",
    targetId: invite.id,
    meta: {
      email: invite.email,
      locationName: invite.locationName,
      parentVendorProfileId,
    },
  });
}
