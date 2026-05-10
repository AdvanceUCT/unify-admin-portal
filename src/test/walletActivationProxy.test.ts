import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/agentClient", () => {
  class AgentServiceError extends Error {
    status: number;
    details?: unknown;

    constructor(message: string, status: number, details?: unknown) {
      super(message);
      this.name = "AgentServiceError";
      this.status = status;
      this.details = details;
    }
  }

  return {
    AgentServiceError,
    resolveActivation: vi.fn(),
  };
});

import { POST as completePost } from "@/app/api/mock/wallet/activation/complete/route";
import { POST as resolvePost } from "@/app/api/mock/wallet/activation/resolve/route";
import { AgentServiceError, resolveActivation } from "@/lib/agentClient";

function jsonRequest(body: unknown) {
  return new Request("http://localhost:3000/api/mock/wallet/activation/resolve", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

describe("wallet activation resolve proxy", () => {
  beforeEach(() => {
    vi.mocked(resolveActivation).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("forwards the token to the agent and synthesises walletId, studentId, and ledgerName", async () => {
    vi.mocked(resolveActivation).mockResolvedValue({
      activationId: "activation-from-agent",
      activationSource: "token",
      createdAt: "2026-04-27T10:00:00.000Z",
      credentialExchangeId: "credential-exchange-001",
      expiresAt: "2026-04-28T10:00:00.000Z",
      invitationId: "invitation-from-agent",
      invitationUrl: "https://issuer.example/oob?oob=abc",
      issuerLabel: "UNIFY Issuer Service",
    });

    const response = await resolvePost(jsonRequest({ token: "real-token", sourceUrl: "https://example/source" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(resolveActivation).toHaveBeenCalledWith({
      sourceUrl: "https://example/source",
      token: "real-token",
    });
    expect(body).toMatchObject({
      activationId: "activation-from-agent",
      activationSource: "token",
      credentialExchangeId: "credential-exchange-001",
      invitationUrl: "https://issuer.example/oob?oob=abc",
      issuerLabel: "UNIFY Issuer Service",
      ledgerName: "BCovrin Test",
      studentId: "activation-from-agent",
      walletId: "wallet-compat-activation-from-agent",
    });
  });

  it("rejects requests without a token", async () => {
    const response = await resolvePost(jsonRequest({ token: "   " }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("ActivationTokenRequired");
    expect(resolveActivation).not.toHaveBeenCalled();
  });

  it("passes through the agent error status when the agent rejects the token", async () => {
    vi.mocked(resolveActivation).mockRejectedValue(
      new AgentServiceError("Activation token not found.", 404),
    );

    const response = await resolvePost(jsonRequest({ token: "missing" }));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toMatchObject({
      code: "AgentActivationResolveFailed",
      message: "Activation token not found.",
    });
  });

  it("returns 502 when the agent service is unreachable", async () => {
    vi.mocked(resolveActivation).mockRejectedValue(new Error("AGENT_SERVICE_URL is not set"));

    const response = await resolvePost(jsonRequest({ token: "any" }));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error.code).toBe("AgentServiceUnavailable");
  });
});

describe("wallet activation complete no-op", () => {
  it("echoes the activation completion fields without forwarding to the agent", async () => {
    const response = await completePost(
      new Request("http://localhost:3000/api/mock/wallet/activation/complete", {
        body: JSON.stringify({
          activationId: "activation-123",
          credentialRecordId: "credential-record-abc",
          holderConnectionId: "connection-xyz",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      activationId: "activation-123",
      credentialRecordId: "credential-record-abc",
      holderConnectionId: "connection-xyz",
    });
    expect(typeof body.completedAt).toBe("string");
    expect(new Date(body.completedAt).toString()).not.toBe("Invalid Date");
  });

  it("rejects requests missing an activationId", async () => {
    const response = await completePost(
      new Request("http://localhost:3000/api/mock/wallet/activation/complete", {
        body: JSON.stringify({ credentialRecordId: "x", holderConnectionId: "y" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("ActivationIdRequired");
  });
});
