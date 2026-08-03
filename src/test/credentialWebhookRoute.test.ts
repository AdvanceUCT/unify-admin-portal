import { createHmac } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/webhooks/agent/route";
import { recordCredentialLifecycleChangedEvent } from "@/lib/credentials/lifecycleActions";
import { recordCredentialStateChangedEvent } from "@/lib/credentials/status";
import { recordVerificationCompletedEvent } from "@/lib/vendors/verifications";

vi.mock("@/lib/config/env", () => ({
  env: {
    WEBHOOK_SIGNING_SECRET: "webhook-secret",
  },
}));

vi.mock("@/lib/credentials/status", () => ({
  recordCredentialStateChangedEvent: vi.fn(async () => ({ duplicate: false })),
}));

vi.mock("@/lib/credentials/lifecycleActions", () => ({
  recordCredentialLifecycleChangedEvent: vi.fn(async () => ({ lifecycleState: "SUSPENDED" })),
}));

vi.mock("@/lib/vendors/verifications", () => ({
  recordVerificationCompletedEvent: vi.fn(async () => ({ duplicate: false })),
}));

function signedRequest(payload: unknown, secret = "webhook-secret", requestId = "agent-webhook-001") {
  const body = JSON.stringify(payload);
  const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

  return new Request("http://localhost:3000/api/webhooks/agent", {
    body,
    headers: {
      "Content-Type": "application/json",
      "X-Request-ID": requestId,
      "X-Unify-Signature": signature,
    },
    method: "POST",
  });
}

describe("agent webhook route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts the existing credential.stateChanged event type", async () => {
    const payload = {
      credentialExchangeId: "credential-exchange-001",
      previousState: "credential-issued",
      state: "done",
      timestamp: "2026-05-16T09:00:00.000Z",
      type: "credential.stateChanged",
    };

    const response = await POST(signedRequest(payload));

    expect(response.status).toBe(202);
    expect(recordCredentialStateChangedEvent).toHaveBeenCalledWith(payload);
  });

  it("rejects invalid webhook signatures", async () => {
    const response = await POST(
      signedRequest(
        {
          credentialExchangeId: "credential-exchange-001",
          state: "done",
          timestamp: "2026-05-16T09:00:00.000Z",
          type: "credential.stateChanged",
        },
        "wrong-secret",
      ),
    );

    expect(response.status).toBe(401);
  });

  it("accepts credential lifecycle events", async () => {
    const payload = {
      credentialExchangeId: "credential-exchange-001",
      credentialRevocationId: "7",
      eventId: "event-001",
      previousStatus: "ACTIVE",
      reason: "Enrolment review",
      revocationRegistryDefinitionId: "rev-reg-001",
      status: "SUSPENDED",
      timestamp: "2026-07-08T09:00:00.000Z",
      type: "credential.lifecycleChanged",
    };

    const response = await POST(signedRequest(payload));

    expect(response.status).toBe(202);
    expect(recordCredentialLifecycleChangedEvent).toHaveBeenCalledWith(payload);
  });

  it("accepts a terminal verification event with the minimal result payload", async () => {
    const payload = {
      type: "verification.completed",
      eventId: "verification-001:Approved",
      verificationRequestId: "verification-001",
      checkoutId: "cart-001",
      vendorId: "vendor-001",
      servicePointId: "service-point-001",
      decision: "Approved",
      expiresAt: "2026-08-03T20:05:00.000Z",
      completedAt: "2026-08-03T20:02:00.000Z",
      timestamp: "2026-08-03T20:02:00.000Z",
    };

    const response = await POST(signedRequest(payload));

    expect(response.status).toBe(202);
    expect(response.headers.get("x-request-id")).toBe("agent-webhook-001");
    expect(recordVerificationCompletedEvent).toHaveBeenCalledWith(payload, "agent-webhook-001");
  });

  it("ignores non-terminal and malformed verification events", async () => {
    const response = await POST(signedRequest({
      type: "verification.completed",
      eventId: "verification-001:Pending",
      verificationRequestId: "verification-001",
      vendorId: "vendor-001",
      servicePointId: "service-point-001",
      decision: "Pending",
      expiresAt: "not-a-date",
      completedAt: "2026-08-03T20:02:00.000Z",
      timestamp: "2026-08-03T20:02:00.000Z",
    }));

    expect(response.status).toBe(202);
    expect(recordVerificationCompletedEvent).not.toHaveBeenCalled();
  });

  it("ignores connection webhooks after signature verification", async () => {
    const response = await POST(
      signedRequest({
        connectionId: "connection-001",
        state: "completed",
        timestamp: "2026-05-16T09:00:00.000Z",
        type: "connection.stateChanged",
      }),
    );

    expect(response.status).toBe(202);
    expect(recordCredentialStateChangedEvent).not.toHaveBeenCalled();
  });
});
