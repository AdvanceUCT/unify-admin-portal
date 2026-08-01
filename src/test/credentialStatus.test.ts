import { describe, expect, it } from "vitest";

import { CredentialIssuanceStatus, CredentialLifecycleStatus } from "@/generated/prisma/enums";
import {
  derivedCredentialEventId,
  isRelevantCredentialStateChangedPayload,
  mapCredoStateToCredentialStatus,
} from "@/lib/credentials/statusMapping";
import { toPublicCredentialStatus } from "@/lib/credentials/lifecycle";

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

  it("maps issued credentials without revocation handles to the legacy lifecycle state", () => {
    expect(
      toPublicCredentialStatus({
        credentialExpiresAt: null,
        credentialRevocationId: null,
        lifecycleStatus: null,
        revocationRegistryDefinitionId: null,
        status: CredentialIssuanceStatus.ISSUED,
      }),
    ).toBe("LEGACY_NON_REVOCABLE");
    expect(
      toPublicCredentialStatus({
        credentialExpiresAt: null,
        credentialRevocationId: "1",
        lifecycleStatus: null,
        revocationRegistryDefinitionId: "rev-reg-1",
        status: CredentialIssuanceStatus.ISSUED,
      }),
    ).toBe("ACTIVE");
  });

  it("treats active credentials as expired after their stored expiry date", () => {
    expect(
      toPublicCredentialStatus(
        {
          credentialExpiresAt: new Date("2026-05-01T00:00:00.000Z"),
          credentialRevocationId: "1",
          lifecycleStatus: CredentialLifecycleStatus.ACTIVE,
          revocationRegistryDefinitionId: "rev-reg-1",
          status: CredentialIssuanceStatus.ISSUED,
        },
        new Date("2026-05-02T00:00:00.000Z"),
      ),
    ).toBe("EXPIRED");
  });

  it("keeps suspension stronger than expiry", () => {
    expect(
      toPublicCredentialStatus(
        {
          credentialExpiresAt: new Date("2026-05-01T00:00:00.000Z"),
          credentialRevocationId: "1",
          lifecycleStatus: CredentialLifecycleStatus.SUSPENDED,
          revocationRegistryDefinitionId: "rev-reg-1",
          status: CredentialIssuanceStatus.ISSUED,
        },
        new Date("2026-05-02T00:00:00.000Z"),
      ),
    ).toBe("SUSPENDED");
  });

});
