import { NextResponse } from "next/server";
import { resolveMockWalletActivation } from "@/lib/api/mockActivationStore";
import type { WalletActivationResolveRequest } from "@/lib/api/types";

async function readJson(request: Request) {
  try {
    return (await request.json()) as Partial<WalletActivationResolveRequest>;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const body = await readJson(request);
  const result = resolveMockWalletActivation({
    kind: "token",
    sourceUrl: body?.sourceUrl,
    token: typeof body?.token === "string" ? body.token : "",
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: {
          code: result.code,
          message: result.error,
          requestId: "mock-wallet-activation-resolve",
        },
      },
      { status: result.status },
    );
  }

  return NextResponse.json(result.data);
}
