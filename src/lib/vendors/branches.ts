import "server-only";

import { z } from "zod";

import {
  AgentServiceError,
  createVerificationServicePoint,
  listVerificationServicePoints,
  updateVerificationServicePoint,
} from "@/lib/agentClient";
import { prisma } from "@/lib/db/prisma";

const branchInputSchema = z.object({
  name: z.string().trim().min(1, "Branch name is required.").max(100),
  address: z.string().trim().max(240).optional(),
});

export function normalizeBranchName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

async function resolveExistingServicePoint(vendorProfileId: string, externalId: string) {
  return (await listVerificationServicePoints()).find(
    (point) => point.vendorId === vendorProfileId && point.externalId === externalId,
  );
}

export async function provisionVendorBranch(branchId: string) {
  const branch = await prisma.vendorBranch.findUnique({
    where: { id: branchId },
    include: { vendorProfile: true },
  });
  if (!branch) throw new Error("Branch was not found.");
  if (branch.agentServicePointId && branch.verificationUrl) return branch;

  try {
    const servicePoint = await createVerificationServicePoint({
      vendorId: branch.vendorProfileId,
      vendorName: branch.vendorProfile.companyName,
      externalId: branch.id,
      name: branch.name,
    });
    return await prisma.vendorBranch.update({
      where: { id: branch.id },
      data: {
        agentServicePointId: servicePoint.id,
        verificationUrl: servicePoint.verificationUrl,
        status: "ACTIVE",
        active: true,
      },
    });
  } catch (error) {
    if (error instanceof AgentServiceError && error.status === 409) {
      const existing = await resolveExistingServicePoint(branch.vendorProfileId, branch.id);
      if (existing) {
        return prisma.vendorBranch.update({
          where: { id: branch.id },
          data: {
            agentServicePointId: existing.id,
            verificationUrl: existing.verificationUrl,
            status: existing.active ? "ACTIVE" : "DISABLED",
            active: existing.active,
          },
        });
      }
    }

    await prisma.vendorBranch.update({
      where: { id: branch.id },
      data: { status: "PROVISIONING_FAILED" },
    });
    throw error;
  }
}

export async function ensureDefaultVendorBranch(vendorProfileId: string) {
  const vendor = await prisma.vendorProfile.findUnique({
    where: { id: vendorProfileId },
    include: { branches: { orderBy: { createdAt: "asc" } } },
  });
  if (!vendor) throw new Error("Vendor profile not found.");

  await prisma.vendorMembership.upsert({
    where: { vendorProfileId_userId: { vendorProfileId, userId: vendor.userId } },
    create: { vendorProfileId, userId: vendor.userId, role: "OWNER" },
    update: { role: "OWNER", active: true },
  });

  let branch = vendor.branches.find((item) => item.id === vendor.defaultBranchId) ?? vendor.branches[0];
  if (!branch) {
    branch = await prisma.vendorBranch.create({
      data: {
        vendorProfileId,
        name: "Main Branch",
        normalizedName: "main branch",
        createdByUserId: vendor.userId,
        agentServicePointId: vendor.agentServicePointId,
        verificationUrl: vendor.verificationUrl,
        status: vendor.agentServicePointId && vendor.verificationUrl ? "ACTIVE" : "PROVISIONING",
      },
    });
  }

  if (!branch.agentServicePointId || !branch.verificationUrl) {
    branch = await provisionVendorBranch(branch.id);
  }

  await prisma.vendorProfile.update({
    where: { id: vendorProfileId },
    data: {
      defaultBranchId: branch.id,
      agentServicePointId: branch.agentServicePointId,
      verificationUrl: branch.verificationUrl,
    },
  });
  return branch;
}

export async function createVendorBranch(
  vendorProfileId: string,
  createdByUserId: string,
  input: { name: string; address?: string },
) {
  const data = branchInputSchema.parse(input);
  let branch;
  try {
    branch = await prisma.vendorBranch.create({
      data: {
        vendorProfileId,
        createdByUserId,
        name: data.name,
        normalizedName: normalizeBranchName(data.name),
        address: data.address || null,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new Error("A branch with this name already exists.");
    throw error;
  }
  return provisionVendorBranch(branch.id);
}

export async function updateVendorBranch(
  vendorProfileId: string,
  branchId: string,
  input: { name: string; address?: string },
) {
  const data = branchInputSchema.parse(input);
  const branch = await prisma.vendorBranch.findFirst({ where: { id: branchId, vendorProfileId } });
  if (!branch) throw new Error("Branch was not found.");

  if (branch.agentServicePointId && branch.name !== data.name) {
    await updateVerificationServicePoint(branch.agentServicePointId, { name: data.name });
  }
  try {
    return await prisma.vendorBranch.update({
      where: { id: branch.id },
      data: {
        name: data.name,
        normalizedName: normalizeBranchName(data.name),
        address: data.address || null,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new Error("A branch with this name already exists.");
    throw error;
  }
}

export async function setVendorBranchActive(vendorProfileId: string, branchId: string, active: boolean) {
  const branch = await prisma.vendorBranch.findFirst({ where: { id: branchId, vendorProfileId } });
  if (!branch) throw new Error("Branch was not found.");
  if (!active) {
    const vendor = await prisma.vendorProfile.findUnique({ where: { id: vendorProfileId } });
    if (vendor?.defaultBranchId === branch.id) {
      throw new Error("Choose another default branch before disabling this branch.");
    }
  }
  if (!branch.agentServicePointId) throw new Error("Branch service point is not configured.");

  await updateVerificationServicePoint(branch.agentServicePointId, { active });
  return prisma.vendorBranch.update({
    where: { id: branch.id },
    data: { active, status: active ? "ACTIVE" : "DISABLED" },
  });
}

export async function setDefaultVendorBranch(vendorProfileId: string, branchId: string) {
  const branch = await prisma.vendorBranch.findFirst({
    where: { id: branchId, vendorProfileId, active: true, status: "ACTIVE" },
  });
  if (!branch?.agentServicePointId || !branch.verificationUrl) {
    throw new Error("Only an active, provisioned branch can be the default.");
  }
  await prisma.vendorProfile.update({
    where: { id: vendorProfileId },
    data: {
      defaultBranchId: branch.id,
      agentServicePointId: branch.agentServicePointId,
      verificationUrl: branch.verificationUrl,
    },
  });
  return branch;
}
