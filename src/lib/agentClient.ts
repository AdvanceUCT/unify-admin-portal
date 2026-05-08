/**
 * @file This file contains the client for interacting with the Identity Agent
 * Service. It is intended to be used only on the server-side.
 */
import "server-only";
import { env } from "@/lib/config/env";

const { AGENT_SERVICE_URL, AGENT_API_KEY } = env;

if (!AGENT_SERVICE_URL || !AGENT_API_KEY) {
  throw new Error(
    "AGENT_SERVICE_URL and AGENT_API_KEY must be set in the environment.",
  );
}

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

async function agentFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const url = new URL(path, AGENT_SERVICE_URL);
  const response = await fetch(url.toString(), {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${AGENT_API_KEY}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    let errorBody: unknown;
    try {
      errorBody = await response.json();
    } catch {
      // ignore
    }

    const errorDetails = extractErrorDetails(errorBody);
    const message =
      errorBody &&
      typeof errorBody === "object" &&
      "message" in errorBody &&
      typeof (errorBody as Record<string, unknown>).message === "string"
        ? String((errorBody as Record<string, unknown>).message)
        : `Agent service request failed: ${response.statusText}`;

    throw new AgentServiceError(message, response.status, errorDetails);
  }

  return response;
}

export async function getStatus(): Promise<{
  status: string;
  ledger: { reachable: boolean };
}> {
  const response = await agentFetch("/api/status");
  return response.json();
}

export async function getIssuerDid(): Promise<{ did: string }> {
  const response = await agentFetch("/api/dids/issuer");
  return response.json();
}

export async function createIssuerDid(alias: string): Promise<{ did: string }> {
  const response = await agentFetch("/api/dids/issuer", {
    method: "POST",
    body: JSON.stringify({ alias }),
  });
  return response.json();
}

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
  });
  return response.json();
}

export async function retryRevocation(
  credentialDefinitionId: string,
  payload: {
    tag: string;
    maximumCredentialNumber: number;
  },
): Promise<{ revocationRegistryDefinitionId: string }> {
  const response = await agentFetch(
    `/api/credential-definitions/${credentialDefinitionId}/revocation-registries`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
  return response.json();
}
