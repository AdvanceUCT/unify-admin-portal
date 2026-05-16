import { describe, expect, it } from "vitest";

import { CredentialIssuanceStatus } from "@/generated/prisma/enums";
import {
  derivedConnectionEventId,
  derivedCredentialEventId,
  isRelevantCredentialStateChangedPayload,
  mapConnectionStateToCredentialStatus,
  mapCredoStateToCredentialStatus,
} from "@/lib/credentials/statusMapping";

describe("credential status mapping", () => {
  it("maps Credo credential exchange states to portal statuses", () => {
    expect(mapCredoStateToCredentialStatus("offer-sent")).toBe(CredentialIssuanceStatus.OFFER_SENT);
    expect(mapCredoStateToCredentialStatus("request-received")).toBeUndefined();
    expect(mapCredoStateToCredentialStatus("credential-issued")).toBeUndefined();
    expect(mapCredoStateToCredentialStatus("done")).toBe(CredentialIssuanceStatus.ISSUED);
    expect(mapCredoStateToCredentialStatus("problem-report")).toBe(CredentialIssuanceStatus.FAILED);
  });

  it("identifies the credential state changes worth storing", () => {
    expect(
      isRelevantCredentialStateChangedPayload({
        credentialExchangeId: "credential-exchange-001",
        previousState: "credential-issued",
        state: "done",
        timestamp: "2026-05-16T09:00:00.000Z",
        type: "credential.stateChanged",
      }),
    ).toBe(true);
    expect(
      isRelevantCredentialStateChangedPayload({
        credentialExchangeId: "credential-exchange-001",
        previousState: "request-received",
        state: "credential-issued",
        timestamp: "2026-05-16T09:00:00.000Z",
        type: "credential.stateChanged",
      }),
    ).toBe(false);
  });

  it("maps the connection completion transition to offer received", () => {
    expect(
      mapConnectionStateToCredentialStatus({
        connectionId: "connection-001",
        outOfBandId: "oob-001",
        previousState: "response-sent",
        state: "completed",
        timestamp: "2026-05-16T09:00:00.000Z",
        type: "connection.stateChanged",
      }),
    ).toBe(CredentialIssuanceStatus.OFFER_RECEIVED);
  });

  it("derives stable webhook event ids from the existing agent payload shape", () => {
    const payload = {
      credentialExchangeId: "credential-exchange-001",
      previousState: "credential-issued",
      state: "done",
      timestamp: "2026-05-16T09:00:00.000Z",
      type: "credential.stateChanged" as const,
    };

    expect(derivedCredentialEventId(payload)).toBe(derivedCredentialEventId(payload));
  });

  it("derives stable connection webhook event ids", () => {
    const payload = {
      connectionId: "connection-001",
      outOfBandId: "oob-001",
      previousState: "response-sent",
      state: "completed",
      timestamp: "2026-05-16T09:00:00.000Z",
      type: "connection.stateChanged" as const,
    };

    expect(derivedConnectionEventId(payload)).toBe(derivedConnectionEventId(payload));
  });
});
