import "server-only";

import { prisma } from "@/lib/db/prisma";

export async function getVendorVerificationStats(vendorProfileId: string) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [total, approved, pending, thisMonth] = await Promise.all([
    prisma.vendorVerification.count({ where: { vendorProfileId } }),
    prisma.vendorVerification.count({ where: { vendorProfileId, status: "APPROVED" } }),
    prisma.vendorVerification.count({ where: { vendorProfileId, status: "PENDING" } }),
    prisma.vendorVerification.count({ where: { vendorProfileId, createdAt: { gte: startOfMonth } } }),
  ]);

  return { total, approved, pending, thisMonth };
}

export async function listRecentVendorVerifications(vendorProfileId: string, limit = 5) {
  return prisma.vendorVerification.findMany({
    where: { vendorProfileId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
