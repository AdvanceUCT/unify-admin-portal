import { createHmac } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/webhooks/agent/route";
import { recordConnectionStateChangedEvent, recordCredentialStateChangedEvent } from "@/lib/credentials/status";

vi.mock("@/lib/config/env", () => ({
  env: {
    WEBHOOK_SIGNING_SECRET: "webhook-secret",
  },
}));

vi.mock("@/lib/credentials/status", () => ({
  recordConnectionStateChangedEvent: vi.fn(async () => ({ duplicate: false })),
  recordCredentialStateChangedEvent: vi.fn(async () => ({ duplicate: false })),
}));

function signedRequest(payload: unknown, secret = "webhook-secret") {
  const body = JSON.stringify(payload);
  const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

  return new Request("http://localhost:3000/api/webhooks/agent", {
    body,
    headers: {
      "Content-Type": "application/json",
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

  it("accepts connection completion events", async () => {
    const payload = {
      connectionId: "connection-001",
      outOfBandId: "oob-001",
      previousState: "response-sent",
      state: "completed",
      timestamp: "2026-05-16T09:00:00.000Z",
      type: "connection.stateChanged",
    };

    const response = await POST(signedRequest(payload));

    expect(response.status).toBe(202);
    expect(recordConnectionStateChangedEvent).toHaveBeenCalledWith(payload);
  });

  it("accepts irrelevant connection webhooks without treating them as credential events", async () => {
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
