/**
 * @fileoverview Loads the approved vendor profile and branch scope for the current session.
 * @module lib/vendors/context
 */

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
  /**
   * The vendor's campus classification for this deployment's single
   * university (see the tenancy note on VendorUniversityPartnership in
   * schema.prisma), or null if no partnership exists yet or it hasn't been
   * classified. Available alongside `role` so any vendor-portal page can
   * gate on it — used today to decide what `/vendor/payments` renders, not
   * to hide the Payments nav item itself (an off-campus or unclassified
   * vendor should still see the tab and land on an explanation, so they
   * know the feature exists and why they don't have it yet).
   */
  campusStatus: "ON_CAMPUS" | "OFF_CAMPUS" | null;
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
        include: {
          branches: { select: { id: true } },
          partnerships: { select: { campusStatus: true }, take: 1 },
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
    campusStatus: membership.vendorProfile.partnerships[0]?.campusStatus ?? null,
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
