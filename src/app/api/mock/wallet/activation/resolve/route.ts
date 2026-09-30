/**
 * @fileoverview Handles the `/api/mock/wallet/activation/resolve` API boundary, including its authorization and request validation.
 * @module app/api/mock/wallet/activation/resolve/route
 */

import { corsPreflight, jsonWithCors } from "@/app/api/mock/cors";
import { AgentServiceError, resolveActivation } from "@/lib/agentClient";
import { requestIdFrom } from "@/lib/requestId";
import type { WalletActivationResolveRequest } from "@/lib/api/types";

const COMPAT_LEDGER_NAME = "BCovrin Test" as const;

async function readJson(request: Request) {
  try {
    return (await request.json()) as Partial<WalletActivationResolveRequest>;
  } catch {
    return null;
  }
}

/**
 * Resolves an activation token by calling the real agent and returning the result
 * to the holder wallet. Adds `ledgerName`, `studentId`, and `walletId` to the
 * response as compatibility fields expected by older wallet app versions.
 */
export async function POST(request: Request) {
  const requestId = requestIdFrom(request.headers.get("x-request-id"));
  const respond = (data: unknown, init?: ResponseInit) => jsonWithCors(data, { ...init, headers: { "X-Request-ID": requestId } });
  const body = await readJson(request);
  const token = typeof body?.token === "string" ? body.token.trim() : "";

  if (!token) {
    return respond(
      {
        error: {
          code: "ActivationTokenRequired",
          message: "Activation token is required.",
          requestId,
        },
      },
      { status: 400 },
    );
  }

  try {
    const agentResponse = await resolveActivation({
      token,
      sourceUrl: typeof body?.sourceUrl === "string" ? body.sourceUrl : undefined,
    }, requestId);

    return respond({
      ...agentResponse,
      ledgerName: COMPAT_LEDGER_NAME,
      studentId: agentResponse.activationId,
      walletId: `wallet-compat-${agentResponse.activationId}`,
    });
  } catch (error) {
    if (error instanceof AgentServiceError) {
      return respond(
        {
          error: {
            code: "AgentActivationResolveFailed",
            message: error.message,
            requestId,
          },
        },
        { status: error.status },
      );
    }

    return respond(
      {
        error: {
          code: "AgentServiceUnavailable",
          message: error instanceof Error ? error.message : "Agent service request failed.",
          requestId,
        },
      },
      { status: 502 },
    );
  }
}

export function OPTIONS() {
  return corsPreflight();
}
