import { corsPreflight, jsonWithCors } from "@/app/api/mock/cors";
import { AgentServiceError, resolveActivation } from "@/lib/agentClient";
import type { WalletActivationResolveRequest } from "@/lib/api/types";

const COMPAT_LEDGER_NAME = "BCovrin Test" as const;

async function readJson(request: Request) {
  try {
    return (await request.json()) as Partial<WalletActivationResolveRequest>;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const body = await readJson(request);
  const token = typeof body?.token === "string" ? body.token.trim() : "";

  if (!token) {
    return jsonWithCors(
      {
        error: {
          code: "ActivationTokenRequired",
          message: "Activation token is required.",
          requestId: "wallet-activation-resolve",
        },
      },
      { status: 400 },
    );
  }

  try {
    const agentResponse = await resolveActivation({
      token,
      sourceUrl: typeof body?.sourceUrl === "string" ? body.sourceUrl : undefined,
    });

    return jsonWithCors({
      ...agentResponse,
      ledgerName: COMPAT_LEDGER_NAME,
      studentId: agentResponse.activationId,
      walletId: `wallet-compat-${agentResponse.activationId}`,
    });
  } catch (error) {
    if (error instanceof AgentServiceError) {
      return jsonWithCors(
        {
          error: {
            code: "AgentActivationResolveFailed",
            message: error.message,
            requestId: "wallet-activation-resolve",
          },
        },
        { status: error.status },
      );
    }

    return jsonWithCors(
      {
        error: {
          code: "AgentServiceUnavailable",
          message: error instanceof Error ? error.message : "Agent service request failed.",
          requestId: "wallet-activation-resolve",
        },
      },
      { status: 502 },
    );
  }
}

export function OPTIONS() {
  return corsPreflight();
}
