import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const envMock = vi.hoisted(() => ({
  AGENT_API_KEY: "test-agent-key",
  AGENT_HEALTH_TIMEOUT_MS: 5_000,
  AGENT_LONG_TIMEOUT_MS: 60_000,
  AGENT_SERVICE_URL: "https://agent.example",
  AGENT_STANDARD_TIMEOUT_MS: 15_000,
}));

vi.mock("@/lib/config/env", () => ({
  env: envMock,
}));

import {
  AgentServiceError,
  changeCredentialLifecycle,
  createBatchActivationLinks,
  createIssuerDid,
  createVerificationServicePoint,
  getIssuerDid,
  getStatus,
  issuanceSetup,
  listVerificationServicePoints,
  registerTrustedCredentialDefinition,
  resolveActivation,
} from "@/lib/agentClient";

function responseJson(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function mockHangingFetch() {
  let aborted = false;

  const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        aborted = true;
        reject(new DOMException("Aborted", "AbortError"));
      });
    }),
  );
  vi.stubGlobal("fetch", fetchMock);

  return {
    aborted: () => aborted,
    fetchMock,
  };
}

describe("agent client timeouts", () => {
  beforeEach(() => {
    envMock.AGENT_API_KEY = "test-agent-key";
    envMock.AGENT_HEALTH_TIMEOUT_MS = 11;
    envMock.AGENT_LONG_TIMEOUT_MS = 33;
    envMock.AGENT_SERVICE_URL = "https://agent.example";
    envMock.AGENT_STANDARD_TIMEOUT_MS = 22;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("maps configured request timeouts to a 504 AgentServiceError", async () => {
    vi.useFakeTimers();
    const { aborted } = mockHangingFetch();

    const request = getIssuerDid().catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(envMock.AGENT_STANDARD_TIMEOUT_MS - 1);
    expect(aborted()).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const error = await request;

    expect(error).toBeInstanceOf(AgentServiceError);
    expect(error).toMatchObject({
      details: {
        code: "AGENT_SERVICE_TIMEOUT",
        path: "/api/dids/issuer",
        timeoutMs: envMock.AGENT_STANDARD_TIMEOUT_MS,
      },
      message: "Agent service request timed out after 22ms.",
      status: 504,
    });
  });

  it("clears timeout timers after successful responses", async () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseJson({ did: "did:example:issuer" })));

    await expect(getIssuerDid()).resolves.toEqual({ did: "did:example:issuer" });

    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
  });

  it("clears timeout timers after non-2xx responses", async () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(responseJson({ details: { code: "AGENT_ERROR" }, message: "Agent rejected it." }, { status: 500, statusText: "Internal Server Error" })),
    );

    await expect(getIssuerDid()).rejects.toMatchObject({
      details: { code: "AGENT_ERROR" },
      message: "Agent rejected it.",
      status: 500,
    });
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps dynamic lifecycle identifiers on the configured agent origin", async () => {
    envMock.AGENT_SERVICE_URL = "https://agent.example/root?ignored=true";
    const fetchMock = vi.fn().mockResolvedValue(
      responseJson({
        credentialExchangeId: "https://evil.example/credentials/1?admin=true#fragment",
        credentialRevocationId: "7",
        revocationRegistryDefinitionId: "rev-reg-1",
        status: "SUSPENDED",
        updatedAt: "2026-08-04T10:00:00.000Z",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await changeCredentialLifecycle(
      "https://evil.example/credentials/1?admin=true#fragment",
      "suspend",
    );

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://agent.example/root/api/credentials/https%3A%2F%2Fevil.example%2Fcredentials%2F1%3Fadmin%3Dtrue%23fragment/suspend",
    );
  });

  it("rejects non-http agent service URLs", async () => {
    envMock.AGENT_SERVICE_URL = "file:///etc/passwd";
    vi.stubGlobal("fetch", vi.fn());

    await expect(getStatus()).rejects.toThrow("AGENT_SERVICE_URL must use http or https.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["getStatus", () => getStatus(), "/api/status", 11],
    ["getIssuerDid", () => getIssuerDid(), "/api/dids/issuer", 22],
    ["createIssuerDid", () => createIssuerDid("Example University"), "/api/dids/issuer", 22],
    ["resolveActivation", () => resolveActivation({ token: "token-1" }), "/api/wallet/activation/resolve", 22],
    ["changeCredentialLifecycle", () => changeCredentialLifecycle("exchange-1", "suspend"), "/api/credentials/exchange-1/suspend", 22],
    ["registerTrustedCredentialDefinition", () => registerTrustedCredentialDefinition("cred-def-1"), "/api/verifier/credential-definitions", 22],
    ["createVerificationServicePoint", () => createVerificationServicePoint({
      externalId: "vendor-1",
      name: "Vendor Verification Point",
      vendorId: "vendor-1",
      vendorName: "Vendor One",
    }), "/api/verifier/service-points", 22],
    ["listVerificationServicePoints", () => listVerificationServicePoints(), "/api/verifier/service-points", 22],
    ["issuanceSetup", () => issuanceSetup({
      credentialDefinition: { supportRevocation: true, tag: "student-1" },
      issuerDid: "did:example:issuer",
      schema: { attributes: ["studentNumber"], name: "StudentIdentity", version: "1.0" },
    }), "/api/issuance/setup", 33],
    ["createBatchActivationLinks", () => createBatchActivationLinks({
      credentialDefinitionId: "cred-def-1",
      students: [{ attributes: [{ name: "studentNumber", value: "STU001" }], externalId: "STU001" }],
    }), "/api/credentials/activation-links/batch", 33],
  ])("uses the configured timeout tier for %s", async (_name, call, path, timeoutMs) => {
    vi.useFakeTimers();
    const { aborted } = mockHangingFetch();

    const request = call().catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(timeoutMs - 1);
    expect(aborted()).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const error = await request;

    expect(error).toMatchObject({
      details: { path, timeoutMs },
      status: 504,
    });
  });

  it("preserves missing agent configuration behavior", async () => {
    envMock.AGENT_SERVICE_URL = undefined as unknown as string;
    vi.stubGlobal("fetch", vi.fn());

    await expect(getStatus()).rejects.toThrow(
      "AGENT_SERVICE_URL and AGENT_API_KEY must be set in the environment.",
    );
  });
});
