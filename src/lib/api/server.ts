import "server-only";

import type { ActivationDelivery } from "@/lib/api/types";
import {
  getCredentialDeliveryByIssuanceId,
  getDashboardCredentialSummary,
  getRecentCredentialActivityEvents,
} from "@/lib/credentials/status";

export async function getDashboardSummary() {
  return getDashboardCredentialSummary();
}

export async function getRecentCredentialEvents() {
  return getRecentCredentialActivityEvents(10);
}

export async function getActivationDeliveryByCredentialId(
  credentialId: string,
): Promise<ActivationDelivery | undefined> {
  return getCredentialDeliveryByIssuanceId(credentialId);
}
