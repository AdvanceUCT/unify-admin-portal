import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { AuditAction } from "@/generated/prisma/enums";
import { auth } from "@/lib/auth/auth";
import { writeAuditLog } from "@/lib/audit/audit";
import {
  INVITABLE_ADMIN_ROLES,
  ROLE_LABELS,
  type AdminRole,
} from "@/lib/auth/roles";
import { env } from "@/lib/config/env";
import { prisma } from "@/lib/db/prisma";
import { sendAdminInviteEmail } from "@/lib/email/admin-invites";

const createInviteSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().min(1, "Name is required"),
  role: z.enum(INVITABLE_ADMIN_ROLES),
});

const acceptInviteSchema = z
  .object({
    token: z.string().min(1, "Invite token is required"),
    password: z.string().min(12, "Password must be at least 12 characters"),
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type CreateAdminInviteInput = {
  email: string;
  name: string;
  role: string;
};
export type AcceptAdminInviteInput = z.input<typeof acceptInviteSchema>;

export function createInviteToken() {
  return randomBytes(32).toString("base64url");
}

export function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Compares two hex token hashes using a constant-time comparison to prevent
 * timing attacks. A regular `===` check would leak information about how many
 * characters match via response time differences.
 */
function isSameTokenHash(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function buildInviteUrl(token: string) {
  const inviteUrl = new URL("/accept-invite", env.APP_URL);
  inviteUrl.searchParams.set("token", token);

  return inviteUrl.toString();
}

/**
 * Writes an `INVITE_EXPIRED` audit entry for an invite, but only if one hasn't
 * been written already. Prevents duplicate audit entries when the same expired
 * invite is looked up multiple times (e.g. by the user retrying the link).
 */
async function auditExpiredInviteOnce(invite: {
  id: string;
  email: string;
  role: string;
  expiresAt: Date;
}) {
  const existingAuditLog = await prisma.auditLog.findFirst({
    where: {
      action: AuditAction.INVITE_EXPIRED,
      targetType: "admin_invite",
      targetId: invite.id,
    },
    select: {
      id: true,
    },
  });

  if (existingAuditLog) {
    return;
  }

  await writeAuditLog({
    action: AuditAction.INVITE_EXPIRED,
    targetType: "admin_invite",
    targetId: invite.id,
    meta: {
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt.toISOString(),
    },
  });
}

/**
 * Creates a new admin invite and sends the invite email.
 * Any existing pending invites for the same email are revoked first so there's
 * only ever one active invite per address. The token is hashed before storage —
 * only the hash is persisted, never the raw token.
 *
 * @param input - The invite details (email, name, role).
 * @param createdByUserId - The admin who is sending the invite.
 * @param request - The current request, used for audit log context.
 * @returns The created invite record.
 */
export async function createAdminInvite({
  input,
  createdByUserId,
  request,
}: {
  input: CreateAdminInviteInput;
  createdByUserId: string;
  request?: Request | null;
}) {
  const data = createInviteSchema.parse(input);
  const email = data.email.toLowerCase();
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + env.ADMIN_INVITE_TTL_HOURS * 60 * 60 * 1000,
  );
  const token = createInviteToken();
  const tokenHash = hashInviteToken(token);
  const inviteUrl = buildInviteUrl(token);

  const revokedPendingInvites = await prisma.adminInvite.updateMany({
    where: {
      email,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: {
        gt: now,
      },
    },
    data: {
      revokedAt: now,
      revokedByUserId: createdByUserId,
    },
  });

  if (revokedPendingInvites.count > 0) {
    await writeAuditLog({
      action: AuditAction.INVITE_REVOKED,
      actorId: createdByUserId,
      targetType: "admin_invite",
      targetId: email,
      meta: {
        reason: "superseded",
        count: revokedPendingInvites.count,
      },
      request,
    });
  }

  const invite = await prisma.adminInvite.create({
    data: {
      email,
      name: data.name,
      role: data.role,
      tokenHash,
      expiresAt,
      createdByUserId,
    },
  });

  await sendAdminInviteEmail({
    to: invite.email,
    name: invite.name,
    inviteUrl,
    expiresAt: invite.expiresAt,
  });

  await writeAuditLog({
    action: AuditAction.INVITE_CREATED,
    actorId: createdByUserId,
    targetType: "admin_invite",
    targetId: invite.id,
    meta: {
      email: invite.email,
      role: invite.role,
    },
    request,
  });

  return invite;
}

/**
 * Looks up a valid pending invite by its raw token.
 * Hashes the token to find the DB record, then does a timing-safe comparison
 * as a second check. Expired invites are audited (once) before returning null.
 *
 * @param token - The raw invite token from the URL.
 * @returns The invite if it's valid and pending, otherwise `null`.
 */
export async function getPendingInviteByToken(token: string) {
  const tokenHash = hashInviteToken(token);
  const invite = await prisma.adminInvite.findUnique({
    where: {
      tokenHash,
    },
  });

  if (!invite || !isSameTokenHash(invite.tokenHash, tokenHash)) {
    return null;
  }

  const now = new Date();

  if (invite.expiresAt <= now && !invite.acceptedAt && !invite.revokedAt) {
    await auditExpiredInviteOnce(invite);
  }

  if (invite.acceptedAt || invite.revokedAt || invite.expiresAt <= now) {
    return null;
  }

  return invite;
}

/**
 * Validates an invite token and creates the admin user account.
 *
 * Uses a conditional `updateMany` to atomically claim the invite, ensuring
 * it can't be accepted twice even under concurrent requests. The user account
 * is created with `emailVerified: true` since the invite itself serves as
 * email verification.
 *
 * @param input - The token, password, and confirmation from the accept form.
 * @returns The newly created user.
 * @throws If the token is invalid, already used, revoked, or expired.
 */
export async function acceptAdminInvite(input: AcceptAdminInviteInput) {
  const data = acceptInviteSchema.parse(input);
  const tokenHash = hashInviteToken(data.token);
  const invite = await prisma.adminInvite.findUnique({
    where: {
      tokenHash,
    },
  });

  if (!invite || !isSameTokenHash(invite.tokenHash, tokenHash)) {
    throw new Error("This invite link is invalid or has expired.");
  }

  const now = new Date();

  if (invite.expiresAt <= now && !invite.acceptedAt && !invite.revokedAt) {
    await auditExpiredInviteOnce(invite);
  }

  if (invite.acceptedAt || invite.revokedAt || invite.expiresAt <= now) {
    throw new Error("This invite link is invalid or has expired.");
  }

  const claimed = await prisma.adminInvite.updateMany({
    where: {
      id: invite.id,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: {
        gt: now,
      },
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
      role: invite.role as AdminRole,
      data: {
        emailVerified: true,
      },
    },
  });

  await prisma.adminInvite.update({
    where: {
      id: invite.id,
    },
    data: {
      acceptedByUserId: result.user.id,
    },
  });

  await writeAuditLog({
    action: AuditAction.INVITE_ACCEPTED,
    actorId: result.user.id,
    targetType: "admin_invite",
    targetId: invite.id,
    meta: {
      email: invite.email,
      role: invite.role,
    },
  });

  return result.user;
}

export function getInviteRoleLabel(role: string) {
  return ROLE_LABELS[role as AdminRole] ?? role;
}
