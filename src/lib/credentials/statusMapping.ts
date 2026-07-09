import { createHash } from "node:crypto";

import { CredentialIssuanceStatus } from "@/generated/prisma/enums";

export type CredentialStateChangedWebhookPayload = {
  connectionId?: string;
  credentialDefinitionId?: string;
  credentialExchangeId: string;
  credentialRevocationId?: string;
  eventId?: string;
  previousState?: string | null;
  revocationRegistryDefinitionId?: string;
  state: string;
  timestamp: string;
  type: "credential.stateChanged";
};

export type CredentialLifecycleChangedWebhookPayload = {
  credentialExchangeId: string;
  credentialRevocationId: string;
  eventId: string;
  previousStatus: "ACTIVE" | "SUSPENDED" | "REVOKED";
  reason?: string;
  revocationRegistryDefinitionId: string;
  status: "ACTIVE" | "SUSPENDED" | "REVOKED";
  statusListTimestamp?: number;
  timestamp: string;
  type: "credential.lifecycleChanged";
};

const failedCredoStates = new Set([
  "abandoned",
  "declined",
  "deleted",
  "failed",
  "problem-report",
  "proposal-declined",
]);

/**
 * Maps a Credo agent state string to our internal `CredentialIssuanceStatus` enum.
 * Returns `undefined` for in-progress states we don't track (e.g. `credential-issued`),
 * so callers can skip updates for those.
 *
 * @param state - The raw state string from the Credo agent.
 * @param currentStatus - The current stored status, available for context if needed.
 * @returns The mapped status, or `undefined` if the state isn't one we care about.
 */
export function mapCredoStateToCredentialStatus(
  state: string,
  currentStatus?: CredentialIssuanceStatus | null,
): CredentialIssuanceStatus | undefined {
  if (state === "offer-sent") return CredentialIssuanceStatus.OFFER_SENT;
  if (state === "done") return CredentialIssuanceStatus.ISSUED;
  if (failedCredoStates.has(state) || state.includes("fail") || state.includes("problem")) {
    return CredentialIssuanceStatus.FAILED;
  }
  return undefined;
}

/**
 * Checks whether a webhook payload is worth processing.
 * We only care about `offer-sent` events, and `done` events that follow
 * `credential-issued` (i.e. the holder accepted). Everything else is ignored.
 *
 * @param payload - The incoming webhook payload.
 * @returns `true` if the event should be recorded, `false` to skip it.
 */
export function isRelevantCredentialStateChangedPayload(payload: CredentialStateChangedWebhookPayload) {
  return payload.state === "offer-sent" || (payload.previousState === "credential-issued" && payload.state === "done");
}

/**
 * Generates a stable event ID when the payload doesn't include one.
 * Hashes a fingerprint of the key payload fields so duplicate events
 * produce the same ID and can be safely skipped with `skipDuplicates`.
 *
 * @param payload - The webhook payload to fingerprint.
 * @returns A SHA-256 hex string to use as the event ID.
 */
export function derivedCredentialEventId(payload: CredentialStateChangedWebhookPayload) {
  const fingerprint = [
    payload.type,
    payload.credentialExchangeId,
    payload.previousState ?? "",
    payload.state,
    payload.timestamp,
  ].join("|");

  return createHash("sha256").update(fingerprint).digest("hex");
}
