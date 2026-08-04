"use server";

import { revalidatePath } from "next/cache";

import { AuditAction } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit/audit";
import { requireVendorSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ensureVendorVerificationServicePoint } from "@/lib/vendors/applications";
import { getVendorAccountContext } from "@/lib/vendors/account";
import {
  createVendorInvite,
  revokeVendorInvite,
} from "@/lib/vendors/invites";

export type CreateVendorInviteState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export async function createVendorInviteAction(
  _previousState: CreateVendorInviteState,
  formData: FormData,
): Promise<CreateVendorInviteState> {
  const session = await requireVendorSession();
  const vendorContext = await getVendorAccountContext(session.user.id);

  if (!vendorContext?.canManageSubVendors || !vendorContext.isApproved) {
    return {
      status: "error",
      message: "Only approved parent vendor accounts can invite locations.",
    };
  }

  try {
    await createVendorInvite({
      input: {
        email: String(formData.get("email") ?? ""),
        name: String(formData.get("name") ?? ""),
        locationName: String(formData.get("locationName") ?? ""),
        locationAddress: String(formData.get("locationAddress") ?? ""),
      },
      createdByUserId: session.user.id,
      parentVendorProfileId: vendorContext.profile.id,
    });

    revalidatePath("/vendor/locations");

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

export async function revokeVendorInviteAction(formData: FormData) {
  const session = await requireVendorSession();
  const vendorContext = await getVendorAccountContext(session.user.id);
  const inviteId = String(formData.get("inviteId") ?? "");

  if (!inviteId || !vendorContext?.canManageSubVendors) {
    return;
  }

  await revokeVendorInvite({
    inviteId,
    parentVendorProfileId: vendorContext.profile.id,
    revokedByUserId: session.user.id,
  });

  revalidatePath("/vendor/locations");
}

export async function deactivateSubVendorAction(formData: FormData) {
  const session = await requireVendorSession();
  const vendorContext = await getVendorAccountContext(session.user.id);
  const vendorProfileId = String(formData.get("vendorProfileId") ?? "");

  if (!vendorProfileId || !vendorContext?.canManageSubVendors) {
    return;
  }

  const subVendor = await prisma.vendorProfile.findFirst({
    where: {
      id: vendorProfileId,
      parentVendorProfileId: vendorContext.profile.id,
    },
    select: {
      userId: true,
      locationName: true,
    },
  });

  if (!subVendor) {
    return;
  }

  await prisma.user.update({
    where: { id: subVendor.userId },
    data: {
      banned: true,
      banReason: "Deactivated by parent vendor",
      banExpires: null,
    },
  });

  await prisma.session.deleteMany({
    where: {
      userId: subVendor.userId,
    },
  });

  await writeAuditLog({
    action: AuditAction.SUB_VENDOR_DEACTIVATED,
    actorId: session.user.id,
    targetType: "vendor_profile",
    targetId: vendorProfileId,
    meta: {
      parentVendorProfileId: vendorContext.profile.id,
      locationName: subVendor.locationName,
    },
  });

  revalidatePath("/vendor/locations");
}

export async function reactivateSubVendorAction(formData: FormData) {
  const session = await requireVendorSession();
  const vendorContext = await getVendorAccountContext(session.user.id);
  const vendorProfileId = String(formData.get("vendorProfileId") ?? "");

  if (!vendorProfileId || !vendorContext?.canManageSubVendors) {
    return;
  }

  const subVendor = await prisma.vendorProfile.findFirst({
    where: {
      id: vendorProfileId,
      parentVendorProfileId: vendorContext.profile.id,
    },
    select: {
      userId: true,
      locationName: true,
    },
  });

  if (!subVendor) {
    return;
  }

  await prisma.user.update({
    where: { id: subVendor.userId },
    data: {
      banned: false,
      banReason: null,
      banExpires: null,
    },
  });

  await writeAuditLog({
    action: AuditAction.SUB_VENDOR_REACTIVATED,
    actorId: session.user.id,
    targetType: "vendor_profile",
    targetId: vendorProfileId,
    meta: {
      parentVendorProfileId: vendorContext.profile.id,
      locationName: subVendor.locationName,
    },
  });

  revalidatePath("/vendor/locations");
}

export async function createSubVendorQrAction(formData: FormData) {
  const session = await requireVendorSession();
  const vendorContext = await getVendorAccountContext(session.user.id);
  const vendorProfileId = String(formData.get("vendorProfileId") ?? "");

  if (!vendorProfileId || !vendorContext?.canManageSubVendors) {
    return;
  }

  const subVendor = await prisma.vendorProfile.findFirst({
    where: {
      id: vendorProfileId,
      parentVendorProfileId: vendorContext.profile.id,
    },
    select: { id: true },
  });

  if (!subVendor) {
    return;
  }

  await ensureVendorVerificationServicePoint(subVendor.id);
  revalidatePath("/vendor/locations");
  revalidatePath("/vendor");
}
