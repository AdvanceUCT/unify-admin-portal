import { NextResponse } from "next/server";
import { completeMockWalletActivation } from "@/lib/api/mockActivationStore";
import type { WalletActivationCompleteRequest } from "@/lib/api/types";

async function readJson(request: Request) {
  try {
    return (await request.json()) as Partial<WalletActivationCompleteRequest>;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const body = await readJson(request);
  const result = completeMockWalletActivation({
    activationId: typeof body?.activationId === "string" ? body.activationId : "",
    credentialRecordId: typeof body?.credentialRecordId === "string" ? body.credentialRecordId : "",
    holderConnectionId: typeof body?.holderConnectionId === "string" ? body.holderConnectionId : "",
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: {
          code: result.code,
          message: result.error,
          requestId: "mock-wallet-activation-complete",
        },
      },
      { status: result.status },
    );
  }

  return NextResponse.json(result.data);
}
