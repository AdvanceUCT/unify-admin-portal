/**
 * @fileoverview Creates the pooled Prisma client and safely reuses it during Next.js development reloads.
 * @module lib/db/prisma
 */

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/config/env";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient() {
  // Application traffic uses the pooled DATABASE_URL. Prisma's migration CLI
  // uses DIRECT_URL separately so schema changes do not run through the pooler.
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

  return new PrismaClient({ adapter });
}

function hasCurrentModelDelegates(client: PrismaClient | undefined): client is PrismaClient {
  // Hot reload can retain a client generated from an older schema. Checking a
  // recently added delegate prevents that stale client from surviving a change.
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
  // Reuse one client across Next.js development reloads to avoid multiplying
  // PostgreSQL pools every time a server module is re-evaluated.
  globalForPrisma.prisma = prisma;
}
