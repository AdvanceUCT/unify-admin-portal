/**
 * @fileoverview Loads the approved vendor profile and branch scope for the current session.
 * @module lib/vendors/context
 */

import "server-only";

import { cache } from "react";
import { forbidden } from "next/navigation";

import { requireVendorSession, requireVendorSessionForRender } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export type ApprovedVendorContext = {
  userId: string;
  vendorProfileId: string;
  companyName: string;
  role: "OWNER" | "STAFF";
  branchIds: string[];
};

async function resolveApprovedVendorContextForUser(userId: string): Promise<ApprovedVendorContext | null> {
  const membership = await prisma.vendorMembership.findFirst({
    where: {
      userId,
      active: true,
      vendorProfile: { applications: { some: { status: "APPROVED" } } },
    },
    select: {
      vendorProfileId: true,
      role: true,
      vendorProfile: {
        select: {
          companyName: true,
          branches: { select: { id: true } },
        },
      },
      branches: { where: { vendorBranch: { active: true } }, select: { vendorBranchId: true } },
    },
  });
  if (!membership) return null;

  return {
    userId,
    vendorProfileId: membership.vendorProfileId,
    companyName: membership.vendorProfile.companyName,
    role: membership.role,
    branchIds:
      membership.role === "OWNER"
        ? membership.vendorProfile.branches.map((branch) => branch.id)
        : membership.branches.map((branch) => branch.vendorBranchId),
  };
}

const getApprovedVendorContextForUserCachedForRender = cache(resolveApprovedVendorContextForUser);

export async function getApprovedVendorContextForUser(userId: string): Promise<ApprovedVendorContext | null> {
  return resolveApprovedVendorContextForUser(userId);
}

export async function getApprovedVendorContextForUserForRender(
  userId: string,
): Promise<ApprovedVendorContext | null> {
  return getApprovedVendorContextForUserCachedForRender(userId);
}

export async function requireApprovedVendorContext() {
  const session = await requireVendorSession();
  const context = await getApprovedVendorContextForUser(session.user.id);
  if (!context) forbidden();
  return { session, context };
}

export async function requireApprovedVendorContextForRender() {
  const session = await requireVendorSessionForRender();
  const context = await getApprovedVendorContextForUserForRender(session.user.id);
  if (!context) forbidden();
  return { session, context };
}

export async function requireVendorOwnerContext() {
  const result = await requireApprovedVendorContext();
  if (result.context.role !== "OWNER") forbidden();
  return result;
}

export async function requireVendorOwnerContextForRender() {
  const result = await requireApprovedVendorContextForRender();
  if (result.context.role !== "OWNER") forbidden();
  return result;
}

export function assertBranchAccess(context: ApprovedVendorContext, branchId: string) {
  if (context.role !== "OWNER" && !context.branchIds.includes(branchId)) forbidden();
}
