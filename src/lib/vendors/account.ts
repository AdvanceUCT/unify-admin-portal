import "server-only";

import { VendorApplicationStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db/prisma";

export type VendorAccountKind = "PARENT" | "SUB_VENDOR";

export type VendorAccountContext = {
  profile: {
    id: string;
    userId: string;
    parentVendorProfileId: string | null;
    companyName: string;
    serviceCategory: string;
    locationName: string | null;
    locationAddress: string | null;
    contactPersonName: string | null;
    contactEmail: string;
    verificationUrl: string | null;
  };
  parentProfile: {
    id: string;
    companyName: string;
    serviceCategory: string;
    verificationUrl: string | null;
  };
  kind: VendorAccountKind;
  isParent: boolean;
  isSubVendor: boolean;
  approvedApplicationId: string | null;
  isApproved: boolean;
  canManageSubVendors: boolean;
  canViewAggregateData: boolean;
  operationalProfileIds: string[];
};

const profileSelect = {
  id: true,
  userId: true,
  parentVendorProfileId: true,
  companyName: true,
  serviceCategory: true,
  locationName: true,
  locationAddress: true,
  contactPersonName: true,
  contactEmail: true,
  verificationUrl: true,
  parentVendorProfile: {
    select: {
      id: true,
      companyName: true,
      serviceCategory: true,
      verificationUrl: true,
    },
  },
} as const;

export async function getVendorAccountContext(
  userId: string,
): Promise<VendorAccountContext | null> {
  const profile = await prisma.vendorProfile.findUnique({
    where: { userId },
    select: profileSelect,
  });

  if (!profile) {
    return null;
  }

  const parentProfile = profile.parentVendorProfile ?? {
    id: profile.id,
    companyName: profile.companyName,
    serviceCategory: profile.serviceCategory,
    verificationUrl: profile.verificationUrl,
  };
  const isParent = profile.parentVendorProfileId === null;

  const approvedApplication = await prisma.vendorApplication.findFirst({
    where: {
      vendorProfileId: parentProfile.id,
      status: VendorApplicationStatus.APPROVED,
    },
    select: { id: true },
  });

  const childProfileIds = isParent
    ? await prisma.vendorProfile.findMany({
        where: { parentVendorProfileId: profile.id },
        select: { id: true },
      })
    : [];

  return {
    profile: {
      id: profile.id,
      userId: profile.userId,
      parentVendorProfileId: profile.parentVendorProfileId,
      companyName: profile.companyName,
      serviceCategory: profile.serviceCategory,
      locationName: profile.locationName,
      locationAddress: profile.locationAddress,
      contactPersonName: profile.contactPersonName,
      contactEmail: profile.contactEmail,
      verificationUrl: profile.verificationUrl,
    },
    parentProfile,
    kind: isParent ? "PARENT" : "SUB_VENDOR",
    isParent,
    isSubVendor: !isParent,
    approvedApplicationId: approvedApplication?.id ?? null,
    isApproved: Boolean(approvedApplication),
    canManageSubVendors: isParent,
    canViewAggregateData: isParent,
    operationalProfileIds: isParent
      ? [profile.id, ...childProfileIds.map((child) => child.id)]
      : [profile.id],
  };
}
