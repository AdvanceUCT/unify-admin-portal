"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { AuditAction } from "@/generated/prisma/enums";
import { auth } from "@/lib/auth/auth";
import { writeAuditLog } from "@/lib/auth/audit";
import { createAdminInvite } from "@/lib/auth/invites";
import { isAdminRole, type AdminRole } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export type CreateInviteState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export async function createInviteAction(
  _previousState: CreateInviteState,
  formData: FormData,
): Promise<CreateInviteState> {
  const session = await requireRole(["SUPER_ADMIN"]);

  try {
    await createAdminInvite({
      input: {
        email: String(formData.get("email") ?? ""),
        name: String(formData.get("name") ?? ""),
        role: String(formData.get("role") ?? ""),
      },
      createdByUserId: session.user.id,
    });

    revalidatePath("/users/invites");

    return {
      status: "success",
      message: "Invite created. In development, check the server console for the invite URL.",
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Unable to create invite.",
    };
  }
}

export async function deactivateUserAction(formData: FormData) {
  const session = await requireRole(["SUPER_ADMIN"]);
  const userId = String(formData.get("userId") ?? "");

  if (!userId || userId === session.user.id) {
    return;
  }

  await auth.api.banUser({
    body: {
      userId,
      banReason: "Deactivated by admin",
    },
    headers: await headers(),
  });

  await auth.api.revokeUserSessions({
    body: {
      userId,
    },
    headers: await headers(),
  });

  await writeAuditLog({
    action: AuditAction.USER_DEACTIVATED,
    actorId: session.user.id,
    targetType: "user",
    targetId: userId,
  });

  revalidatePath("/users");
}

export async function reactivateUserAction(formData: FormData) {
  const session = await requireRole(["SUPER_ADMIN"]);
  const userId = String(formData.get("userId") ?? "");

  if (!userId) {
    return;
  }

  await auth.api.unbanUser({
    body: {
      userId,
    },
    headers: await headers(),
  });

  await writeAuditLog({
    action: AuditAction.USER_REACTIVATED,
    actorId: session.user.id,
    targetType: "user",
    targetId: userId,
  });

  revalidatePath("/users/invites");
}

export async function changeUserRoleAction(formData: FormData) {
  const session = await requireRole(["SUPER_ADMIN"]);
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");

  if (!userId || userId === session.user.id || !isAdminRole(role)) {
    return;
  }

  await auth.api.setRole({
    body: {
      userId,
      role: role as AdminRole,
    },
    headers: await headers(),
  });

  await writeAuditLog({
    action: AuditAction.USER_ROLE_CHANGED,
    actorId: session.user.id,
    targetType: "user",
    targetId: userId,
    meta: {
      role,
    },
  });

  revalidatePath("/users");
}

export async function revokeUserSessionsAction(formData: FormData) {
  const session = await requireRole(["SUPER_ADMIN"]);
  const userId = String(formData.get("userId") ?? "");

  if (!userId) {
    return;
  }

  await auth.api.revokeUserSessions({
    body: {
      userId,
    },
    headers: await headers(),
  });

  await writeAuditLog({
    action: AuditAction.SESSION_REVOKED,
    actorId: session.user.id,
    targetType: "user",
    targetId: userId,
  });

  revalidatePath("/users");
}

export async function revokeInviteAction(formData: FormData) {
  const session = await requireRole(["SUPER_ADMIN"]);
  const inviteId = String(formData.get("inviteId") ?? "");

  if (!inviteId) {
    return;
  }

  const invite = await prisma.adminInvite.update({
    where: {
      id: inviteId,
      acceptedAt: null,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
      revokedByUserId: session.user.id,
    },
  });

  await writeAuditLog({
    action: AuditAction.INVITE_REVOKED,
    actorId: session.user.id,
    targetType: "admin_invite",
    targetId: invite.id,
    meta: {
      email: invite.email,
      role: invite.role,
    },
  });

  revalidatePath("/users");
}
