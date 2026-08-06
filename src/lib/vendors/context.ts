import "server-only";

import { forbidden } from "next/navigation";

import { requireVendorSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export type ApprovedVendorContext = {
  userId: string;
  vendorProfileId: string;
  companyName: string;
  role: "OWNER" | "STAFF";
  branchIds: string[];
};

export async function getApprovedVendorContextForUser(userId: string): Promise<ApprovedVendorContext | null> {
  const membership = await prisma.vendorMembership.findFirst({
    where: {
      userId,
      active: true,
      vendorProfile: { applications: { some: { status: "APPROVED" } } },
    },
    include: {
      vendorProfile: {
        include: { branches: { select: { id: true } } },
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

export async function requireApprovedVendorContext() {
  const session = await requireVendorSession();
  const context = await getApprovedVendorContextForUser(session.user.id);
  if (!context) forbidden();
  return { session, context };
}

export async function requireVendorOwnerContext() {
  const result = await requireApprovedVendorContext();
  if (result.context.role !== "OWNER") forbidden();
  return result;
}

export function assertBranchAccess(context: ApprovedVendorContext, branchId: string) {
  if (context.role !== "OWNER" && !context.branchIds.includes(branchId)) forbidden();
}
