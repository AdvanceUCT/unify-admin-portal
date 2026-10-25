import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getCredentialValidity } from "@/lib/agentClient";
import { credentialDate } from "./validity";

/**
 * Scan a bounded page and recover only exact dates from the matching authenticated agent credential/definition.
 * Never infer missing signed dates from current policy or acceptance time. Default to reporting; apply uses old-value conditions to detect concurrent changes.
 */
export async function backfillCredentialValidity(options: { apply?: boolean; after?: string; limit?: number } = {}) {
  const rows = await prisma.credentialIssuance.findMany({
    where: { OR: [{ credentialValidFrom: null }, { credentialExpiresAt: null }], ...(options.after ? { id: { gt: options.after } } : {}) },
    orderBy: { id: "asc" }, take: options.limit ?? 100,
  });
  const result = { scanned: rows.length, recoverable: 0, updated: 0, unavailable: 0, conflicting: 0, next: rows.length ? rows[rows.length - 1].id : null };
  for (const issuance of rows) {
    if (!issuance.credentialExchangeId) { result.unavailable++; continue; }
    try {
      const source = await getCredentialValidity(issuance.credentialExchangeId);
      const start = credentialDate(source.credentialValidity?.validFrom), end = credentialDate(source.credentialValidity?.expiresAt);
      if (source.id !== issuance.credentialExchangeId || source.credentialDefinitionId !== issuance.credentialDefinitionId || start === undefined || end === undefined || start >= end) { result.unavailable++; continue; }
      if ((issuance.credentialValidFrom && issuance.credentialValidFrom.getTime() !== start) || (issuance.credentialExpiresAt && issuance.credentialExpiresAt.getTime() !== end)) { result.conflicting++; continue; }
      result.recoverable++;
      if (options.apply) {
        const changed = await prisma.credentialIssuance.updateMany({
          where: { id: issuance.id, credentialExchangeId: issuance.credentialExchangeId, credentialDefinitionId: issuance.credentialDefinitionId, credentialValidFrom: issuance.credentialValidFrom, credentialExpiresAt: issuance.credentialExpiresAt },
          data: { credentialValidFrom: new Date(start), credentialExpiresAt: new Date(end) },
        });
        result.updated += changed.count;
        if (!changed.count) result.conflicting++;
      }
    } catch { result.unavailable++; }
  }
  return result;
}
