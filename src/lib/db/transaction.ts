import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

export function hasPrismaErrorCode(error: unknown, code: string) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

/**
 * Runs a Prisma transaction at Serializable isolation, retrying up to 3 times
 * if Postgres aborts it for a serialization conflict (Prisma error P2034).
 */
export async function runSerializableTransaction<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: "Serializable",
      });
    } catch (error) {
      if (!hasPrismaErrorCode(error, "P2034") || attempt === 2) {
        throw error;
      }
    }
  }

  throw new Error("The transaction could not be completed.");
}
