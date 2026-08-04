import "server-only";

import { prisma } from "@/lib/db/prisma";

function toProfileIdFilter(vendorProfileIds: string | string[]) {
  return Array.isArray(vendorProfileIds)
    ? { in: vendorProfileIds }
    : vendorProfileIds;
}

export async function getVendorVerificationStats(vendorProfileIds: string | string[]) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const vendorProfileId = toProfileIdFilter(vendorProfileIds);

  const [total, approved, pending, thisMonth] = await Promise.all([
    prisma.vendorVerification.count({ where: { vendorProfileId } }),
    prisma.vendorVerification.count({ where: { vendorProfileId, status: "APPROVED" } }),
    prisma.vendorVerification.count({ where: { vendorProfileId, status: "PENDING" } }),
    prisma.vendorVerification.count({ where: { vendorProfileId, createdAt: { gte: startOfMonth } } }),
  ]);

  return { total, approved, pending, thisMonth };
}

export async function listRecentVendorVerifications(vendorProfileIds: string | string[], limit = 5) {
  const vendorProfileId = toProfileIdFilter(vendorProfileIds);

  return prisma.vendorVerification.findMany({
    where: { vendorProfileId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
