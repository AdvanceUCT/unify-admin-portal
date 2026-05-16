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
  if (state === "request-received") return CredentialIssuanceStatus.ACCEPTED;
  if (state === "credential-issued") {
    return currentStatus === CredentialIssuanceStatus.ISSUED
      ? CredentialIssuanceStatus.ISSUED
      : CredentialIssuanceStatus.ACCEPTED;
  }
  if (state === "done") return CredentialIssuanceStatus.ISSUED;
  if (failedCredoStates.has(state) || state.includes("fail") || state.includes("problem")) {
    return CredentialIssuanceStatus.FAILED;
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
