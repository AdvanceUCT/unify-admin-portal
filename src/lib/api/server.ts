import "server-only";

import type { ActivationDelivery } from "@/lib/api/types";
import { getRecentCredentialAuditActivityEvents } from "@/lib/credentials/audit";
import {
  getCredentialDeliveryByIssuanceId,
  getDashboardCredentialSummary,
} from "@/lib/credentials/status";

export async function getDashboardSummary() {
  return getDashboardCredentialSummary();
}

export async function getRecentCredentialEvents() {
  return getRecentCredentialAuditActivityEvents(10);
}

export async function getActivationDeliveryByCredentialId(
  credentialId: string,
): Promise<ActivationDelivery | undefined> {
  return getCredentialDeliveryByIssuanceId(credentialId);
}
