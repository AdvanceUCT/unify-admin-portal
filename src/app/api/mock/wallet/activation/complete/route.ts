import { corsPreflight, jsonWithCors } from "@/app/api/mock/cors";
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
  const activationId = typeof body?.activationId === "string" ? body.activationId.trim() : "";

  if (!activationId) {
    return jsonWithCors(
      {
        error: {
          code: "ActivationIdRequired",
          message: "Activation id is required.",
          requestId: "wallet-activation-complete",
        },
      },
      { status: 400 },
    );
  }

  return jsonWithCors({
    activationId,
    completedAt: new Date().toISOString(),
    credentialRecordId: typeof body?.credentialRecordId === "string" ? body.credentialRecordId : "",
    holderConnectionId: typeof body?.holderConnectionId === "string" ? body.holderConnectionId : "",
  });
}

export function OPTIONS() {
  return corsPreflight();
}
