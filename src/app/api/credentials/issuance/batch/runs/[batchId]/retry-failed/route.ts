import { NextResponse } from "next/server";

import { assertCan, PermissionError, type SessionWithRole } from "@/lib/auth/permissions";
import { getCurrentAdminSession, getSessionForAudit } from "@/lib/auth/session";
import { retryFailedBatchRun } from "@/lib/issuance/batchRuns";

export async function POST(_request: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const session = await getCurrentAdminSession();

  try {
    assertCan("credential:write", session as SessionWithRole);
  } catch (error) {
    const status = error instanceof PermissionError ? error.status : 401;
    return NextResponse.json({ error: { message: "Unauthorized batch retry request." } }, { status });
  }

  try {
    const [{ batchId }, auditSession] = await Promise.all([params, getSessionForAudit()]);
    return NextResponse.json(await retryFailedBatchRun(batchId, auditSession.actorId));
  } catch (error) {
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : "Batch retry failed." } },
      { status: 502 },
    );
  }
}
