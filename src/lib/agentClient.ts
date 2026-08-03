/**
 * @file This file contains the client for interacting with the Identity Agent
 * Service. It is intended to be used only on the server-side.
 */
import "server-only";
import { env } from "@/lib/config/env";

const timeoutDetailsCode = "AGENT_SERVICE_TIMEOUT";

type AgentFetchOptions = Omit<RequestInit, "signal"> & {
  timeoutMs: number;
};

/**
 * Custom error for failed Identity Agent Service requests.
 * Includes the HTTP status code and any structured error details from the response body.
 */
export class AgentServiceError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "AgentServiceError";
    this.status = status;
    this.details = details;
  }
}

/**
 * Pulls the most specific error details out of a failed agent response body.
 * Checks `body.details` then `body.error.details`, falling back to the raw body
 * if neither exists.
 *
 * @param errorBody - The parsed JSON body of a failed agent response.
 * @returns The details payload, or the raw body if no details field is found.
 */
function extractErrorDetails(errorBody: unknown) {
  if (!errorBody || typeof errorBody !== "object") {
    return errorBody;
  }

  const record = errorBody as Record<string, unknown>;
  if (record.details !== undefined) {
    return record.details;
  }

  const nestedError = record.error;
  if (nestedError && typeof nestedError === "object") {
    const nestedRecord = nestedError as Record<string, unknown>;
    if (nestedRecord.details !== undefined) {
      return nestedRecord.details;
    }
  }

  return errorBody;
}

function extractErrorMessage(errorBody: unknown, fallback: string) {
  if (!errorBody || typeof errorBody !== "object") return fallback;
  const record = errorBody as Record<string, unknown>;
  if (typeof record.message === "string") return record.message;
  const nested = record.error;
  if (nested && typeof nested === "object" && typeof (nested as Record<string, unknown>).message === "string") {
    return String((nested as Record<string, unknown>).message);
  }
  return fallback;
}

function isAbortError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}

/**
 * Internal fetch wrapper for the Identity Agent Service. Prepends the base URL,
 * injects auth headers, and throws an `AgentServiceError` for any non-2xx response.
 *
 * @param path - The API path to request, e.g. `/api/status`.
 * @param options - Standard `fetch` options merged with the auth headers.
 * @returns The raw `Response` for successful requests.
 * @throws {Error} If `AGENT_SERVICE_URL` or `AGENT_API_KEY` are not set.
 * @throws {AgentServiceError} If the agent returns a non-2xx status.
 */
async function agentFetch(
  path: string,
  options: AgentFetchOptions,
): Promise<Response> {
  const { AGENT_SERVICE_URL, AGENT_API_KEY } = env;

  if (!AGENT_SERVICE_URL || !AGENT_API_KEY) {
    throw new Error(
      "AGENT_SERVICE_URL and AGENT_API_KEY must be set in the environment.",
    );
  }

  const url = new URL(path, AGENT_SERVICE_URL);
  const { timeoutMs, ...fetchOptions } = options;
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        ...fetchOptions.headers,
        Authorization: `Bearer ${AGENT_API_KEY}`,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    if (timedOut && isAbortError(error)) {
      throw new AgentServiceError(
        `Agent service request timed out after ${timeoutMs}ms.`,
        504,
        { code: timeoutDetailsCode, path, timeoutMs },
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    let errorBody: unknown;
    try {
      errorBody = await response.json();
    } catch {
      // ignore
    }

    const errorDetails = extractErrorDetails(errorBody);
    const message = extractErrorMessage(errorBody, `Agent service request failed: ${response.statusText}`);

    throw new AgentServiceError(message, response.status, errorDetails);
  }

  return response;
}

export async function getStatus(): Promise<{
  status: string;
  ledger: { reachable: boolean };
}> {
  const response = await agentFetch("/api/status", {
    timeoutMs: env.AGENT_HEALTH_TIMEOUT_MS,
  });
  return response.json();
}

export async function getIssuerDid(): Promise<{ did: string }> {
  const response = await agentFetch("/api/dids/issuer", {
    timeoutMs: env.AGENT_STANDARD_TIMEOUT_MS,
  });
  return response.json();
}

export async function createIssuerDid(alias: string): Promise<{ did: string }> {
  const response = await agentFetch("/api/dids/issuer", {
    method: "POST",
    body: JSON.stringify({ alias }),
    timeoutMs: env.AGENT_STANDARD_TIMEOUT_MS,
  });
  return response.json();
}

/**
 * Sets up a schema, credential definition, and optional revocation registry in one call.
 * Usually called once during tenant onboarding before any credentials can be issued.
 *
 * @param payload.issuerDid - The DID to use as the credential issuer.
 * @param payload.schema - Name, version, and attributes for the schema.
 * @param payload.credentialDefinition - Tag and revocation support flag.
 * @param payload.revocation - Optional tag and max credential count for the revocation registry.
 * @returns The resolved IDs for the schema, credential definition, and revocation registry.
 * @throws {AgentServiceError} If the agent rejects the setup request.
 */
export async function issuanceSetup(payload: {
  issuerDid: string;
  schema: {
    name: string;
    version: string;
    attributes: string[];
  };
  credentialDefinition: {
    tag: string;
    supportRevocation: boolean;
  };
  revocation?: {
    tag: string;
    maximumCredentialNumber: number;
  };
}): Promise<{
  schemaId: string;
  credentialDefinitionId: string;
  revocationRegistryDefinitionId?: string;
}> {
  const response = await agentFetch("/api/issuance/setup", {
    method: "POST",
    body: JSON.stringify(payload),
    timeoutMs: env.AGENT_LONG_TIMEOUT_MS,
  });
  return response.json();
}

/**
 * Creates activation links for a batch of students in one request. The agent
 * returns both successful offers and per-student failures, so one failure doesn't
 * block the rest.
 *
 * @param payload.credentialDefinitionId - The credential definition to issue against.
 * @param payload.students - Attribute sets for each student, with optional email and external ID.
 * @returns Successful offers and any per-student failures.
 * @throws {AgentServiceError} If the agent rejects the entire batch request.
 */
export async function createBatchActivationLinks(payload: {
  credentialDefinitionId: string;
  revocationRegistryDefinitionId?: string;
  students: Array<{
    attributes: Array<{ name: string; value: string }>;
    email?: string;
    externalId?: string;
  }>;
}): Promise<{
  failures: Array<{ email?: string; externalId?: string; message: string }>;
  offers: Array<{
    activationId: string;
    activationUrl: string;
    credentialExchangeId: string;
    credentialRevocationId?: string;
    email?: string;
    expiresAt: string;
    externalId?: string;
    revocationRegistryDefinitionId?: string;
  }>;
}> {
  const response = await agentFetch("/api/credentials/activation-links/batch", {
    method: "POST",
    body: JSON.stringify(payload),
    timeoutMs: env.AGENT_LONG_TIMEOUT_MS,
  });
  return response.json();
}

/**
 * Exchanges an activation token for the full activation record, including the
 * invitation URL the holder wallet needs to open to receive the credential offer.
 *
 * @param payload.token - The activation token to resolve.
 * @param payload.sourceUrl - The original URL the token came from, used for audit tracking.
 * @returns The resolved activation record with invitation URL and expiry.
 * @throws {AgentServiceError} If the token is invalid, expired, or already used.
 */
export async function resolveActivation(payload: {
  token: string;
  sourceUrl?: string;
}): Promise<{
  activationId: string;
  activationSource: string;
  createdAt: string;
  credentialExchangeId: string;
  expiresAt: string;
  invitationId: string;
  invitationUrl: string;
  issuerLabel: string;
}> {
  const response = await agentFetch("/api/wallet/activation/resolve", {
    method: "POST",
    body: JSON.stringify(payload),
    timeoutMs: env.AGENT_STANDARD_TIMEOUT_MS,
  });
  return response.json();
}

export type AgentCredentialLifecycleResult = {
  credentialExchangeId: string;
  credentialRevocationId: string;
  eventId?: string;
  reason?: string;
  reactivatedAt?: string;
  revocationRegistryDefinitionId: string;
  revokedAt?: string;
  status: "ACTIVE" | "SUSPENDED" | "REVOKED";
  statusListTimestamp?: number;
  suspendedAt?: string;
  updatedAt: string;
};

export async function changeCredentialLifecycle(
  credentialExchangeId: string,
  action: "reactivate" | "revoke" | "suspend",
  reason?: string,
): Promise<AgentCredentialLifecycleResult> {
  const response = await agentFetch(
    `/api/credentials/${encodeURIComponent(credentialExchangeId)}/${action}`,
    {
      body: JSON.stringify({ reason }),
      method: "POST",
      timeoutMs: env.AGENT_STANDARD_TIMEOUT_MS,
    },
  );
  return response.json();
}

export type TrustedCredentialDefinition = {
  active: boolean;
  attributes: string[];
  createdAt: string;
  credentialDefinitionId: string;
  isDefault: boolean;
  schemaId: string;
  schemaName: string;
  schemaVersion: string;
  updatedAt: string;
};

export async function registerTrustedCredentialDefinition(
  credentialDefinitionId: string,
  makeDefault = false,
): Promise<TrustedCredentialDefinition> {
  const response = await agentFetch("/api/verifier/credential-definitions", {
    body: JSON.stringify({ credentialDefinitionId, makeDefault }),
    method: "POST",
    timeoutMs: env.AGENT_STANDARD_TIMEOUT_MS,
  });
  return response.json();
}

export async function createVerificationServicePoint(payload: {
  vendorId: string;
  vendorName: string;
  externalId: string;
  name: string;
}): Promise<{ id: string; verificationUrl: string }> {
  const response = await agentFetch("/api/verifier/service-points", {
    method: "POST",
    body: JSON.stringify(payload),
    timeoutMs: env.AGENT_STANDARD_TIMEOUT_MS,
  });
  return response.json();
}

export async function listVerificationServicePoints(): Promise<
  Array<{
    id: string;
    vendorId: string;
    vendorName: string;
    externalId: string;
    name: string;
    active: boolean;
    verificationUrl: string;
  }>
> {
  const response = await agentFetch("/api/verifier/service-points", {
    timeoutMs: env.AGENT_STANDARD_TIMEOUT_MS,
  });
  return response.json();
}
