import { createHash } from "node:crypto";

import { CredentialIssuanceStatus } from "@/generated/prisma/enums";

export type CredentialStateChangedWebhookPayload = {
  connectionId?: string;
  credentialDefinitionId?: string;
  credentialExchangeId: string;
  eventId?: string;
  previousState?: string | null;
  state: string;
  timestamp: string;
  type: "credential.stateChanged";
};

export type ConnectionStateChangedWebhookPayload = {
  connectionId: string;
  eventId?: string;
  outOfBandId?: string;
  previousState?: string | null;
  state: string;
  theirLabel?: string;
  timestamp: string;
  type: "connection.stateChanged";
};

const failedCredoStates = new Set([
  "abandoned",
  "declined",
  "deleted",
  "failed",
  "problem-report",
  "proposal-declined",
]);

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

export function isRelevantCredentialStateChangedPayload(payload: CredentialStateChangedWebhookPayload) {
  return payload.state === "offer-sent" || (payload.previousState === "credential-issued" && payload.state === "done");
}

export function mapConnectionStateToCredentialStatus(
  payload: ConnectionStateChangedWebhookPayload,
): CredentialIssuanceStatus | undefined {
  if (payload.previousState === "response-sent" && payload.state === "completed") {
    return CredentialIssuanceStatus.OFFER_RECEIVED;
  }

  return undefined;
}

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

export function derivedConnectionEventId(payload: ConnectionStateChangedWebhookPayload) {
  const fingerprint = [
    payload.type,
    payload.outOfBandId ?? "",
    payload.connectionId,
    payload.previousState ?? "",
    payload.state,
    payload.timestamp,
  ].join("|");

  return createHash("sha256").update(fingerprint).digest("hex");
}
