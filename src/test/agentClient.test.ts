import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config/env", () => ({
  env: {
    AGENT_API_KEY: "test-agent-key",
    AGENT_SERVICE_URL: "http://agent.test",
  },
}));

import { AgentServiceError, revokeCredential } from "@/lib/agentClient";

describe("revokeCredential", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves without throwing when the agent confirms the revocation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ revoked: true }), { status: 200 })),
    );

    await expect(revokeCredential({ credentialExchangeId: "exchange-1" })).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(
      "http://agent.test/api/credentials/exchange-1/revoke",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("surfaces the agent's nested error message instead of a generic status text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: "Not implemented: RevocationService.revoke" } }), {
          status: 500,
          statusText: "Internal Server Error",
        }),
      ),
    );

    await expect(revokeCredential({ credentialExchangeId: "exchange-1" })).rejects.toMatchObject({
      message: "Not implemented: RevocationService.revoke",
      status: 500,
    });
  });

  it("falls back to a generic message when the agent's error body has no message field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 503, statusText: "Service Unavailable" })),
    );

    await expect(revokeCredential({ credentialExchangeId: "exchange-1" })).rejects.toBeInstanceOf(AgentServiceError);
    await expect(revokeCredential({ credentialExchangeId: "exchange-1" })).rejects.toMatchObject({
      message: "Agent service request failed: Service Unavailable",
    });
  });
});
