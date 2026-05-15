import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/config/env";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

  return new PrismaClient({ adapter });
}

function hasCurrentModelDelegates(client: PrismaClient | undefined): client is PrismaClient {
  const candidate = client as PrismaClient & {
    batchIssuanceItem?: unknown;
    batchIssuanceRun?: unknown;
  };

  return Boolean(candidate?.batchIssuanceItem && candidate.batchIssuanceRun);
}

const prismaClient: PrismaClient = hasCurrentModelDelegates(globalForPrisma.prisma)
  ? globalForPrisma.prisma
  : createPrismaClient();

export const prisma = prismaClient;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
