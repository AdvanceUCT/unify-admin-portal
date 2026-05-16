import { NextResponse } from "next/server";

import { assertCan, PermissionError, type SessionWithRole } from "@/lib/auth/permissions";
import { getCurrentAdminSession, getSessionForAudit } from "@/lib/auth/session";
import { parseBatchIssuanceSelection, queueRealBatchIssuance, StudentIssuanceError } from "@/lib/issuance/batchIssuance";

export async function POST(request: Request) {
  const session = await getCurrentAdminSession();

  try {
    assertCan("credential:write", session as SessionWithRole);
  } catch (error) {
    const status = error instanceof PermissionError ? error.status : 401;
    return NextResponse.json({ error: { message: "Unauthorized credential issuance request." } }, { status });
  }

  try {
    const body = (await request.json().catch(() => undefined)) as unknown;
    const selection = parseBatchIssuanceSelection(body);
    const auditSession = await getSessionForAudit();
    return NextResponse.json(await queueRealBatchIssuance(selection, new Date(), auditSession.actorId), {
      status: 201,
    });
  } catch (error) {
    const status = error instanceof StudentIssuanceError ? error.status : 502;
    return NextResponse.json(
      {
        error: {
          message: error instanceof Error ? error.message : "Batch credential issuance failed.",
        },
      },
      { status },
    );
  }
}
